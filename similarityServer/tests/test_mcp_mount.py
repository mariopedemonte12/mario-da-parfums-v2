"""Integration tests for the MCP sub-app mount in app.py.

Per specs/similarity-search-mcp.md's central decision ("un solo proceso, un
solo container"): the MCP server is mounted as a second ASGI surface on the
*same* FastAPI() app that serves GET /search and GET /health, sharing the
same `app.state.index`. That claim -- same process, same in-memory index,
both surfaces reachable together -- is exactly the kind of thing a test that
only exercises mcp_server.py in isolation (tests/test_mcp_server.py) or
app.py's HTTP routes in isolation (tests/test_app.py) cannot catch: the bug
this file guards against lives *between* those two units, not inside either.
Hence "integration" despite not needing a real Postgres (no test in this file
does -- the DB-touching lifespan step is skipped exactly like tests/test_app.py
skips it, by setting app.state.index directly), so this lives in tests/ rather
than tests/integration/ (that directory's own convention is real-Postgres
tests, per its conftest.py).

Every test drives the mounted sub-app over the real streamable-HTTP MCP
protocol via httpx's ASGI transport (no real network socket, no uvicorn
process) -- this is the same wire protocol the chatbot's MCP client actually
speaks, so it also exercises app.py's redirect-to-trailing-slash mount
behavior that a lower-level in-memory client/server pair would bypass.

Each test re-imports similarityServer.app fresh rather than reusing the
process-wide singleton tests/test_app.py shares: app.py's
`mcp_server.session_manager` (a StreamableHTTPSessionManager) can only have
`.run()` entered once per instance ever -- true in production too, where a
process imports app.py and enters its lifespan exactly once -- so running
more than one test against the same imported module would make every test
after the first fail for reasons that have nothing to do with the test's own
assertions.
"""

import asyncio
import importlib
import sys

import httpx
import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from similarityServer.similarity import PerfumeSimilarityIndex

pytestmark = pytest.mark.anyio

_CATALOG = [
    ("Rose Noire", "floral"),
    ("Oak Barrel", "woody"),
    ("Citrus Burst", "citrus"),
]


@pytest.fixture
def app_module():
    """A fresh import of similarityServer.app, so this test's own
    mcp_server.session_manager has never had .run() called on it yet."""
    sys.modules.pop("similarityServer.app", None)
    return importlib.import_module("similarityServer.app")


@pytest.fixture
def built_app(app_module, fake_encoder):
    """Sets app.state.index by hand (lifespan/DB skipped, same seam as
    tests/test_app.py) and returns this test's own FastAPI app instance."""
    app_module.app.state.index = PerfumeSimilarityIndex(encode=fake_encoder)
    app_module.app.state.index.build(_CATALOG)
    return app_module.app


@pytest.fixture
async def http_client(built_app):
    """A single httpx.AsyncClient over an ASGI transport onto built_app --
    shared by both plain-HTTP calls and the MCP client in a test, since it's
    the same process/app either way."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=built_app), base_url="http://testserver"
    ) as client:
        yield client


def _mcp_url(app_module) -> str:
    return "http://testserver" + app_module.load_mcp_mount_path()


async def test_mcp_tool_is_reachable_at_the_configured_mount_path(app_module, http_client):
    async with app_module.mcp_server.session_manager.run():
        async with streamable_http_client(_mcp_url(app_module), http_client=http_client) as (
            read,
            write,
            _,
        ):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = (await session.list_tools()).tools
                assert [tool.name for tool in tools] == ["search_similar_fragrances"]

                result = await session.call_tool(
                    "search_similar_fragrances", {"query": "woody", "top_k": 1}
                )
                assert result.isError is False
                assert result.structuredContent["result"] == [
                    {"name": "Oak Barrel", "score": pytest.approx(1.0, abs=1e-6)}
                ]


async def test_health_route_still_plain_http_alongside_the_mcp_mount(app_module, http_client):
    # spec: GET /health stays a plain HTTP infra endpoint -- confirm it keeps
    # working with the MCP sub-app mounted and its session manager running.
    async with app_module.mcp_server.session_manager.run():
        response = await http_client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


async def test_mcp_tool_and_http_search_share_the_same_in_memory_index(
    app_module, built_app, http_client
):
    # spec: "compartiendo el mismo indice en memoria" -- sync()ing the index
    # once must be visible identically from both surfaces, not just at
    # startup: add a fragrance after both surfaces are already live and
    # confirm each one independently observes it.
    async with app_module.mcp_server.session_manager.run():
        built_app.state.index.sync([*_CATALOG, ("Sugar Cane", "sweet")])

        http_response = await http_client.get("/search", params={"q": "sweet", "top_k": 1})
        assert http_response.json()["results"][0]["name"] == "Sugar Cane"

        async with streamable_http_client(_mcp_url(app_module), http_client=http_client) as (
            read,
            write,
            _,
        ):
            async with ClientSession(read, write) as session:
                await session.initialize()
                mcp_result = await session.call_tool(
                    "search_similar_fragrances", {"query": "sweet", "top_k": 1}
                )
                assert mcp_result.structuredContent["result"][0]["name"] == "Sugar Cane"


async def test_abandoned_mcp_client_does_not_affect_the_shared_process(
    app_module, built_app, http_client
):
    """spec: "Cliente MCP (chatbot) se desconecta a mitad de una busqueda no
    afecta al proceso FastAPI ni a la ruta HTTP /search, que sigue sirviendo
    en paralelo". Simulate a client that vanishes without a graceful shutdown
    (no DELETE/termination ever sent -- a dropped connection, not a clean
    disconnect) by running the client/session on its own asyncio task and
    cancelling that task from the outside once it's made a successful call,
    instead of letting it reach its own clean __aexit__. Runs on a separate
    task (not inline in this test's own task) so the cancellation unwinds via
    that task's own cancel-scope stack, exactly like a real client process
    dying would -- not this test's."""
    async with app_module.mcp_server.session_manager.run():

        async def client_that_disappears():
            async with streamable_http_client(_mcp_url(app_module), http_client=http_client) as (
                read,
                write,
                _,
            ):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.call_tool(
                        "search_similar_fragrances", {"query": "woody"}
                    )
                    assert result.isError is False
                    # abandoned here: the surrounding task is cancelled
                    # before this coroutine ever reaches its own clean exit.

        client_task = asyncio.ensure_future(client_that_disappears())
        await asyncio.sleep(0.05)
        client_task.cancel()
        try:
            await client_task
        except asyncio.CancelledError:
            pass  # cancelled mid-flight, or finished first -- either is fine here

        response = await http_client.get("/search", params={"q": "woody", "top_k": 1})
        assert response.status_code == 200
        assert response.json()["results"][0]["name"] == "Oak Barrel"

        async with streamable_http_client(_mcp_url(app_module), http_client=http_client) as (
            read2,
            write2,
            _2,
        ):
            async with ClientSession(read2, write2) as fresh_session:
                await fresh_session.initialize()
                fresh_result = await fresh_session.call_tool(
                    "search_similar_fragrances", {"query": "woody"}
                )
                assert fresh_result.isError is False
