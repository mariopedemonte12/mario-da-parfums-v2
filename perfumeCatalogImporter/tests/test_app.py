"""Unit tests for the FastAPI app (perfumeCatalogImporter/app.py).

Per the package's testing seams: FastAPI's TestClient used WITHOUT the `with`
context-manager form never triggers `lifespan` (verified against this FastAPI
version before writing these tests), so `app.state.index` is set by hand to a
PerfumeSimilarityIndex built with a fake encoder -- no DB, no real model, no
uvicorn process. The lifespan function itself (DB connect/sync/close) is
tested separately below by invoking it directly with everything monkeypatched.
"""

import asyncio

import pytest
from fastapi.testclient import TestClient

from perfumeCatalogImporter import app as app_module
from perfumeCatalogImporter.similarity import PerfumeSimilarityIndex


@pytest.fixture
def client(fake_encoder):
    app_module.app.state.index = PerfumeSimilarityIndex(encode=fake_encoder)
    app_module.app.state.index.build(
        [
            ("Rose Noire", "floral"),
            ("Oak Barrel", "woody"),
            ("Citrus Burst", "citrus"),
            ("Velvet Musk", "musky"),
            ("Smoke Trail", "smoky"),
            ("Sugar Cane", "sweet"),
        ]
    )
    return TestClient(app_module.app)


def test_health_check(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_search_happy_path_returns_ranked_results(client):
    response = client.get("/search", params={"q": "woody", "top_k": 2})

    assert response.status_code == 200
    body = response.json()
    assert body["results"][0] == {"name": "Oak Barrel", "score": pytest.approx(1.0, abs=1e-6)}
    assert len(body["results"]) == 2


def test_search_missing_query_param_is_rejected(client):
    response = client.get("/search")

    assert response.status_code == 422


def test_search_empty_query_string_is_rejected(client):
    # BVA boundary: q has min_length=1 -- "" is one below the boundary.
    response = client.get("/search", params={"q": ""})

    assert response.status_code == 422


def test_search_single_character_query_is_accepted(client):
    # BVA boundary: min_length=1 -- "a" is exactly at the boundary.
    response = client.get("/search", params={"q": "a"})

    assert response.status_code == 200


def test_search_top_k_defaults_to_five(client):
    response = client.get("/search", params={"q": "floral"})

    assert response.status_code == 200
    assert len(response.json()["results"]) == 5


@pytest.mark.parametrize("top_k", [0])
def test_search_top_k_below_minimum_is_rejected(client, top_k):
    # BVA boundary: top_k has ge=1 -- 0 is one below the boundary.
    response = client.get("/search", params={"q": "floral", "top_k": top_k})

    assert response.status_code == 422


def test_search_top_k_at_minimum_is_accepted(client):
    # BVA boundary: ge=1 -- 1 is exactly at the boundary.
    response = client.get("/search", params={"q": "floral", "top_k": 1})

    assert response.status_code == 200
    assert len(response.json()["results"]) == 1


def test_search_top_k_at_maximum_is_accepted(client):
    # BVA boundary: le=50 -- 50 is exactly at the boundary.
    response = client.get("/search", params={"q": "floral", "top_k": 50})

    assert response.status_code == 200
    assert len(response.json()["results"]) == 6  # capped by catalog size, not top_k


def test_search_top_k_above_maximum_is_rejected(client):
    # BVA boundary: le=50 -- 51 is one past the boundary.
    response = client.get("/search", params={"q": "floral", "top_k": 51})

    assert response.status_code == 422


def test_search_against_an_unbuilt_index_returns_503(fake_encoder):
    app_module.app.state.index = PerfumeSimilarityIndex(encode=fake_encoder)
    client = TestClient(app_module.app)

    response = client.get("/search", params={"q": "floral"})

    assert response.status_code == 503


# --- lifespan: DB connection is opened for the sync step and always closed ---


class _FakeConnection:
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


def _run_lifespan_once(monkeypatch, ensure_up_to_date_side_effect=None):
    fake_connection = _FakeConnection()
    monkeypatch.setattr(app_module.psycopg2, "connect", lambda dsn: fake_connection)
    monkeypatch.setattr(
        app_module,
        "load_server_config",
        lambda: type(
            "Cfg",
            (),
            {
                "database_url": "postgresql://fake",
                "embeddings_path": "unused.npz",
                "model_name": "unused",
                "host": "0.0.0.0",
                "port": 8001,
                "log_level": "info",
            },
        )(),
    )

    def fake_ensure_up_to_date(self):
        if ensure_up_to_date_side_effect is not None:
            raise ensure_up_to_date_side_effect
        return None

    monkeypatch.setattr(app_module.IndexSyncService, "ensure_up_to_date", fake_ensure_up_to_date)
    # Never construct a real sentence-transformers model in this test.
    monkeypatch.setattr(app_module, "default_encoder", lambda model_name: (lambda texts: texts))

    async def drive():
        async with app_module.lifespan(app_module.app):
            pass

    return fake_connection, drive


def test_lifespan_closes_db_connection_after_successful_sync(monkeypatch):
    fake_connection, drive = _run_lifespan_once(monkeypatch)

    asyncio.run(drive())

    assert fake_connection.closed is True
    assert app_module.app.state.index is not None


def test_lifespan_closes_db_connection_even_if_sync_raises(monkeypatch):
    fake_connection, drive = _run_lifespan_once(monkeypatch, ensure_up_to_date_side_effect=RuntimeError("boom"))

    with pytest.raises(RuntimeError):
        asyncio.run(drive())

    assert fake_connection.closed is True
