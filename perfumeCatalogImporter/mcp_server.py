"""MCP server exposing PerfumeSimilarityIndex search as a tool.

See specs/similarity-search-mcp.md: this is a second transport (MCP over
streamable HTTP) for the exact same read-only capability GET /search already
serves in app.py -- same in-memory index, same process, no new capability.
"""

from collections.abc import Callable
from typing import Annotated

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import BaseModel, Field

from .similarity import PerfumeSimilarityIndex


class SimilarFragrance(BaseModel):
    name: str
    score: float


def create_mcp_server(get_index: Callable[[], PerfumeSimilarityIndex]) -> FastMCP:
    """get_index is called on every tool invocation, not once at construction time:
    this server is built at app.py's module scope, before the FastAPI lifespan
    has built app.state.index (the sync against Postgres happens at startup)."""
    server = FastMCP(
        name="perfume-similarity-search",
        # "/" because app.py mounts this sub-app's ASGI app under its own
        # prefix (e.g. /mcp) -- keeping this path too would double it up.
        streamable_http_path="/",
        # No host/origin allowlisting: same reachability as GET /search and
        # GET /health today -- see "Autenticación/autorización" in the spec.
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=False
        ),
    )

    @server.tool()
    def search_similar_fragrances(
        query: Annotated[
            str,
            Field(
                min_length=1, description="Free-text description of the desired scent"
            ),
        ],
        top_k: Annotated[
            int, Field(ge=1, le=50, description="Maximum number of results")
        ] = 5,
    ) -> list[SimilarFragrance]:
        """Search fragrances by free-text scent description, ranked by similarity."""
        try:
            results = get_index().search(query, top_k=top_k)
        except RuntimeError as exc:
            raise ToolError(str(exc)) from exc
        return [SimilarFragrance(name=name, score=score) for name, score in results]

    return server
