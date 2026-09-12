"""FastAPI server exposing perfume similarity search.

Two responsibilities (see specs/perfume-similarity-search.md):

1. On startup: connect to Postgres, use IndexSyncService to bring the
   on-disk embeddings index up to date with the `fragrances` table
   (encoding whatever's new/changed with the sentence-transformers encoder),
   then close the connection. The DB is only touched at startup — a search
   request never hits Postgres, it only runs against the in-memory index.
2. Serve semantic search over that index. The encoder and the embedding
   matrix are loaded once and kept in memory for the life of the process —
   no per-request model loading, no per-request DB roundtrip.

The backend NestJS API never loads this model or talks to Postgres for
embeddings — it calls this service over HTTP instead (explicit decision,
see the spec).
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import psycopg2
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from .index_sync import IndexSyncService
from .repository import FragranceRepository
from .server_config import load_server_config
from .similarity import PerfumeSimilarityIndex, default_encoder

logger = logging.getLogger(__name__)


class SearchResult(BaseModel):
    name: str
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    config = load_server_config()
    logging.basicConfig(level=config.log_level.upper())

    index = PerfumeSimilarityIndex(encode=default_encoder(config.model_name))

    connection = psycopg2.connect(config.database_url)
    try:
        IndexSyncService(FragranceRepository(connection), index, config.embeddings_path).ensure_up_to_date()
    finally:
        connection.close()

    app.state.index = index
    yield


app = FastAPI(title="Perfume similarity search", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/search", response_model=SearchResponse)
def search(
    q: str = Query(..., min_length=1, description="Free-text description of the desired scent"),
    top_k: int = Query(5, ge=1, le=50),
) -> SearchResponse:
    index: PerfumeSimilarityIndex = app.state.index
    try:
        results = index.search(q, top_k=top_k)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return SearchResponse(results=[SearchResult(name=name, score=score) for name, score in results])


if __name__ == "__main__":
    import uvicorn

    _config = load_server_config()
    uvicorn.run("perfumeCatalogImporter.app:app", host=_config.host, port=_config.port)
