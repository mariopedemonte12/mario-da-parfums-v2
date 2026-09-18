"""Fixtures for tests that need a real Postgres (root docker-compose.yml, service `postgres`).

Every fixture row is inserted and read back inside one uncommitted transaction
that gets rolled back at the end of the test, so nothing is ever left behind
in the shared DB regardless of pass/fail -- no manual DELETE cleanup needed.
"""

import os

import psycopg2
import pytest

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://mario_da_parfums:mario_da_parfums@localhost:5432/mario_da_parfums"
)


@pytest.fixture
def db_connection():
    try:
        connection = psycopg2.connect(DATABASE_URL)
    except psycopg2.OperationalError as exc:
        pytest.skip(f"Postgres not reachable at {DATABASE_URL}: {exc}")
    try:
        yield connection
    finally:
        connection.rollback()
        connection.close()


@pytest.fixture
def insert_fragrance(db_connection):
    """insert_fragrance(name, brand, description=None) -> None, uncommitted."""

    def _insert(name: str, brand: str = "Test Brand", description: str | None = None) -> None:
        with db_connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO fragrances (name, brand, description) VALUES (%s, %s, %s)",
                (name, brand, description),
            )

    return _insert
