"""Unit tests for the MCP tool surface (perfumeCatalogImporter/mcp_server.py).

Per specs/similarity-search-mcp.md, `search_similar_fragrances` is a second
transport over exactly the same read-only capability as `GET /search`, so the
happy-path/BVA cases mirror tests/test_app.py's for `GET /search` -- same
catalog, same fake_encoder, same boundaries -- but exercised over the real
MCP protocol (tools/list, tools/call) via an in-memory client/server pair
(`mcp.shared.memory.create_connected_server_and_client_session`), not by
calling the decorated Python function directly. That in-memory pair runs the
actual `mcp.server.lowlevel.Server` request handling, so a validation error
or a raised exception inside the tool is exercised exactly as a real MCP
client (the chatbot) would see it: as a `CallToolResult` with
`isError=True`, never a Python exception propagating out of `call_tool`.
"""

from collections.abc import Callable
from contextlib import asynccontextmanager

import pytest
from mcp import ClientSession
from mcp.shared.memory import create_connected_server_and_client_session

from perfumeCatalogImporter.mcp_server import create_mcp_server
from perfumeCatalogImporter.similarity import PerfumeSimilarityIndex

pytestmark = pytest.mark.anyio

_CATALOG = [
    ("Rose Noire", "floral"),
    ("Oak Barrel", "woody"),
    ("Citrus Burst", "citrus"),
    ("Velvet Musk", "musky"),
    ("Smoke Trail", "smoky"),
    ("Sugar Cane", "sweet"),
]


@pytest.fixture
def mcp_session_for():
    """Async context manager: given a get_index callable, yields a connected
    ClientSession talking to a fresh create_mcp_server(get_index) over the
    real (in-memory) MCP protocol."""

    @asynccontextmanager
    async def _make(get_index: Callable[[], PerfumeSimilarityIndex]):
        server = create_mcp_server(get_index=get_index)
        async with create_connected_server_and_client_session(server, raise_exceptions=False) as client:
            yield client

    return _make


@pytest.fixture
def built_index(fake_encoder) -> PerfumeSimilarityIndex:
    index = PerfumeSimilarityIndex(encode=fake_encoder)
    index.build(_CATALOG)
    return index


# --- tool surface shape ---


async def test_exposes_exactly_one_tool(built_index, mcp_session_for):
    async with mcp_session_for(lambda: built_index) as client:
        tools = (await client.list_tools()).tools

        assert [tool.name for tool in tools] == ["search_similar_fragrances"]


async def test_health_is_not_exposed_as_an_mcp_tool(built_index, mcp_session_for):
    # spec: "GET /health no se expone como tool MCP".
    async with mcp_session_for(lambda: built_index) as client:
        tools = (await client.list_tools()).tools

        assert "health" not in [tool.name for tool in tools]


# --- happy path / ranking ---


async def test_search_happy_path_returns_ranked_results(built_index, mcp_session_for):
    async with mcp_session_for(lambda: built_index) as client:
        result = await client.call_tool("search_similar_fragrances", {"query": "woody", "top_k": 2})

        assert result.isError is False
        results = result.structuredContent["result"]
        assert results[0] == {"name": "Oak Barrel", "score": pytest.approx(1.0, abs=1e-6)}
        assert len(results) == 2


async def test_search_top_k_defaults_to_five(built_index, mcp_session_for):
    async with mcp_session_for(lambda: built_index) as client:
        result = await client.call_tool("search_similar_fragrances", {"query": "floral"})

        assert result.isError is False
        assert len(result.structuredContent["result"]) == 5


# --- BVA: query (min_length=1) ---


async def test_search_empty_query_is_rejected(built_index, mcp_session_for):
    # BVA boundary: min_length=1 -- "" is one below the boundary.
    async with mcp_session_for(lambda: built_index) as client:
        result = await client.call_tool("search_similar_fragrances", {"query": ""})

        assert result.isError is True


async def test_search_single_character_query_is_accepted(built_index, mcp_session_for):
    # BVA boundary: min_length=1 -- "a" is exactly at the boundary.
    async with mcp_session_for(lambda: built_index) as client:
        result = await client.call_tool("search_similar_fragrances", {"query": "a"})

        assert result.isError is False


# --- BVA: top_k (ge=1, le=50) ---


async def test_search_top_k_below_minimum_is_rejected(built_index, mcp_session_for):
    # BVA boundary: ge=1 -- 0 is one below the boundary.
    async with mcp_session_for(lambda: built_index) as client:
        result = await client.call_tool("search_similar_fragrances", {"query": "floral", "top_k": 0})

        assert result.isError is True


async def test_search_top_k_at_minimum_is_accepted(built_index, mcp_session_for):
    # BVA boundary: ge=1 -- 1 is exactly at the boundary.
    async with mcp_session_for(lambda: built_index) as client:
        result = await client.call_tool("search_similar_fragrances", {"query": "floral", "top_k": 1})

        assert result.isError is False
        assert len(result.structuredContent["result"]) == 1


async def test_search_top_k_at_maximum_is_accepted(built_index, mcp_session_for):
    # BVA boundary: le=50 -- 50 is exactly at the boundary.
    async with mcp_session_for(lambda: built_index) as client:
        result = await client.call_tool("search_similar_fragrances", {"query": "floral", "top_k": 50})

        assert result.isError is False
        assert len(result.structuredContent["result"]) == 6  # capped by catalog size, not top_k


async def test_search_top_k_above_maximum_is_rejected(built_index, mcp_session_for):
    # BVA boundary: le=50 -- 51 is one past the boundary.
    async with mcp_session_for(lambda: built_index) as client:
        result = await client.call_tool("search_similar_fragrances", {"query": "floral", "top_k": 51})

        assert result.isError is True


# --- error handling (spec: "Manejo de errores") ---


async def test_search_against_an_unbuilt_index_returns_explicit_tool_error(fake_encoder, mcp_session_for):
    unbuilt_index = PerfumeSimilarityIndex(encode=fake_encoder)

    async with mcp_session_for(lambda: unbuilt_index) as client:
        result = await client.call_tool("search_similar_fragrances", {"query": "floral"})

        assert result.isError is True


async def test_runtime_error_does_not_kill_the_mcp_connection(fake_encoder, mcp_session_for):
    # spec: a RuntimeError from search() must produce "un resultado de error
    # explicito" -- it must not "tumbar la conexion MCP ni el proceso". Prove
    # the *connection* survives by making a second, successful call on the
    # same session right after the error.
    #
    # Mutation testing note: cosmic-ray's ExceptionReplacer on the `except
    # RuntimeError` clause in mcp_server.py survives and is equivalent, not a
    # gap -- verified by hand that removing that except-clause entirely
    # produces byte-identical isError/content, because FastMCP's
    # Tool.run() unconditionally re-wraps *any* exception (including a
    # ToolError our own code already raised) as
    # ToolError(f"Error executing tool {name}: {e}") one level up. That
    # explicit except-RuntimeError branch has no observable effect through
    # the MCP protocol either way, so no black-box test can distinguish the
    # two -- asserting only isError, not exact message text, reflects that.
    unbuilt_index = PerfumeSimilarityIndex(encode=fake_encoder)

    async with mcp_session_for(lambda: unbuilt_index) as client:
        error_result = await client.call_tool("search_similar_fragrances", {"query": "floral"})
        assert error_result.isError is True

        unbuilt_index.build(_CATALOG)
        ok_result = await client.call_tool("search_similar_fragrances", {"query": "floral"})
        assert ok_result.isError is False
        assert ok_result.structuredContent["result"][0]["name"] == "Rose Noire"


# --- get_index is resolved lazily, not snapshotted at server-construction time ---


async def test_get_index_is_called_per_invocation_not_cached_at_construction(fake_encoder):
    """mcp_server.py's docstring: get_index is called on every tool invocation
    because app.py builds this server before app.state.index exists (the DB
    sync happens later, in the FastAPI lifespan). Simulate that ordering: build
    the server against a holder whose `.index` is still None, then only
    populate it afterwards -- exactly like app.state.index being set once the
    lifespan's startup sync finishes."""

    class _Holder:
        index: PerfumeSimilarityIndex | None = None

    holder = _Holder()
    server = create_mcp_server(get_index=lambda: holder.index)

    async with create_connected_server_and_client_session(server, raise_exceptions=False) as client:
        too_early = await client.call_tool("search_similar_fragrances", {"query": "floral"})
        assert too_early.isError is True

        holder.index = PerfumeSimilarityIndex(encode=fake_encoder)
        holder.index.build(_CATALOG)

        now_ready = await client.call_tool("search_similar_fragrances", {"query": "floral"})
        assert now_ready.isError is False
        assert now_ready.structuredContent["result"][0]["name"] == "Rose Noire"
