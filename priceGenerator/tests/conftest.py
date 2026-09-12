"""Session-wide test setup: marker registration is in pytest.ini.

Integration tests (marked `integration`, fixtures in tests/integration/conftest.py)
need a real, reachable Postgres. If none is reachable in this environment,
skip them instead of failing the whole run -- unit tests must stay runnable
with no DB at all.
"""

import os

import psycopg2
import pytest

DEFAULT_TEST_DATABASE_URL = (
    "postgresql://mario_da_parfums:mario_da_parfums@localhost:5432/mario_da_parfums"
)


def _test_database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_TEST_DATABASE_URL)


def pytest_collection_modifyitems(config, items):
    integration_items = [item for item in items if item.get_closest_marker("integration")]
    if not integration_items:
        return

    try:
        connection = psycopg2.connect(_test_database_url())
        connection.close()
    except Exception as exc:
        skip_marker = pytest.mark.skip(reason=f"no reachable Postgres for integration tests: {exc}")
        for item in integration_items:
            item.add_marker(skip_marker)
