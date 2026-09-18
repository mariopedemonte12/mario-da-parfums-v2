"""Integration tests for FragranceReader against a real Postgres instance.

Run with `pytest -m integration`. Requires DATABASE_URL to point at a
reachable Postgres with the fragrances table already migrated (see
the host-only DATABASE_URL in the root .env.example for the local docker-compose shape).
"""

import pytest

from priceGenerator.fragrance_reader import FragranceReader

pytestmark = pytest.mark.integration


def test_list_all_includes_a_freshly_inserted_fragrance(db_connection, fragrance_factory, unique_suffix):
    name = f"ZZTEST Fragrance {unique_suffix}"
    fragrance_id = fragrance_factory(name)
    reader = FragranceReader(db_connection)

    fragrances = reader.list_all()

    matching = [f for f in fragrances if f.id == fragrance_id]
    assert len(matching) == 1
    assert matching[0].name == name


def test_list_all_returns_uuid_ids_as_strings(db_connection, fragrance_factory, unique_suffix):
    fragrance_id = fragrance_factory(f"ZZTEST Fragrance Str {unique_suffix}")
    reader = FragranceReader(db_connection)

    matching = next(f for f in reader.list_all() if f.id == fragrance_id)

    assert isinstance(matching.id, str)
