"""Integration tests for FragranceRepository.upsert() against real Postgres.

Worth a real DB per the scope gate: the behavior under test is the actual
`INSERT ... ON CONFLICT (name, brand) DO UPDATE` statement and its created/updated
detection (RETURNING (created_at = updated_at)) -- a mock of psycopg2 wouldn't
exercise that SQL or Postgres's real behavior around it. Also covers that a
failed upsert() rolls back and leaves the connection usable for the next call
(CatalogSyncOrchestrator relies on this to isolate per-item failures -- see
repository.py's docstring and NOTES.md).

Every inserted row lives only inside an uncommitted transaction... except
upsert() itself commits per call (by design, see NOTES.md's "why one now()
per fragrance"), so these tests can't rely on the shared db_connection
fixture's rollback-at-teardown to clean up -- they DELETE their own rows
explicitly instead, scoped to unique names so they never collide with the
real catalog import's data.
"""

import uuid

import pytest

from perfumeCatalogImporter.models import CatalogFragrance
from perfumeCatalogImporter.repository import FragranceRepository


def _unique_name(label: str) -> str:
    return f"__test_repo_upsert_{label}_{uuid.uuid4().hex[:8]}"


def _fragrance(name: str, **overrides) -> CatalogFragrance:
    fields = dict(
        name=name,
        brand="Test Brand",
        concentration="Eau de Parfum",
        description="a test description",
        image_url=None,
        olfactory_family="Woody Spicy",
        target_audience="Unisex",
        longevity="Strong",
    )
    fields.update(overrides)
    return CatalogFragrance(**fields)


@pytest.fixture
def real_connection(db_connection):
    """A real, committing connection -- separate concern from db_connection's
    rollback-on-teardown fixtures used elsewhere in this file's siblings,
    since upsert() commits its own transaction regardless of what the test does."""
    return db_connection


@pytest.fixture
def cleanup_names(real_connection):
    names: list[str] = []
    yield names
    if names:
        with real_connection.cursor() as cursor:
            cursor.execute("DELETE FROM fragrances WHERE name = ANY(%s)", (names,))
        real_connection.commit()


class TestInsertBranch:
    def test_new_record_inserts_all_eight_columns_correctly(self, real_connection, cleanup_names):
        name = _unique_name("insert")
        cleanup_names.append(name)
        record = _fragrance(
            name,
            brand="Dumont",
            concentration="Eau de Parfum",
            description="una fragancia de prueba",
            olfactory_family="Fresh Scent",
            target_audience="Male",
            longevity="Strong",
        )

        result = FragranceRepository(real_connection).upsert(record)

        assert result.created is True
        assert result.name == name

        with real_connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT brand, concentration, description, image_url,
                       olfactory_family, target_audience, longevity
                FROM fragrances WHERE name = %s
                """,
                (name,),
            )
            row = cursor.fetchone()

        assert row == (
            "Dumont",
            "Eau de Parfum",
            "una fragancia de prueba",
            None,
            "Fresh Scent",
            "Male",
            "Strong",
        )

    def test_insert_with_null_optional_columns(self, real_connection, cleanup_names):
        name = _unique_name("insert_nulls")
        cleanup_names.append(name)
        record = _fragrance(
            name,
            concentration=None,
            description=None,
            olfactory_family=None,
            target_audience=None,
            longevity=None,
        )

        result = FragranceRepository(real_connection).upsert(record)

        assert result.created is True
        with real_connection.cursor() as cursor:
            cursor.execute(
                "SELECT concentration, description, olfactory_family, target_audience, longevity "
                "FROM fragrances WHERE name = %s",
                (name,),
            )
            row = cursor.fetchone()
        assert row == (None, None, None, None, None)


class TestUpdateBranch:
    def test_reupsert_updates_all_eight_columns_including_the_three_new_ones(
        self, real_connection, cleanup_names
    ):
        name = _unique_name("update")
        cleanup_names.append(name)
        repository = FragranceRepository(real_connection)

        # brand is part of the matching key (name, brand) -- it must stay the
        # same across both calls, or the second call is a different identity
        # (an INSERT of a new row) rather than an update of this one.
        first = repository.upsert(
            _fragrance(
                name,
                brand="Same Brand",
                concentration="Eau de Toilette",
                description="old description",
                olfactory_family="Citrus",
                target_audience="Male",
                longevity="Light",
            )
        )
        assert first.created is True

        second = repository.upsert(
            _fragrance(
                name,
                brand="Same Brand",
                concentration="Eau de Parfum",
                description="new description",
                olfactory_family="Woody Spicy",
                target_audience="Unisex",
                longevity="Very Strong",
            )
        )

        assert second.created is False
        assert second.name == name

        with real_connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT brand, concentration, description, olfactory_family,
                       target_audience, longevity, created_at < updated_at
                FROM fragrances WHERE name = %s
                """,
                (name,),
            )
            row = cursor.fetchone()

        assert row == (
            "Same Brand",
            "Eau de Parfum",
            "new description",
            "Woody Spicy",
            "Unisex",
            "Very Strong",
            True,
        )

    def test_reupsert_can_clear_a_previously_set_optional_column_to_null(
        self, real_connection, cleanup_names
    ):
        name = _unique_name("clear")
        cleanup_names.append(name)
        repository = FragranceRepository(real_connection)

        repository.upsert(_fragrance(name, target_audience="Male", longevity="Strong"))
        repository.upsert(_fragrance(name, target_audience=None, longevity=None))

        with real_connection.cursor() as cursor:
            cursor.execute(
                "SELECT target_audience, longevity FROM fragrances WHERE name = %s", (name,)
            )
            row = cursor.fetchone()
        assert row == (None, None)


class TestFailureLeavesConnectionUsable:
    def test_upsert_failure_rolls_back_and_connection_stays_usable_for_the_next_call(
        self, real_connection, cleanup_names
    ):
        repository = FragranceRepository(real_connection)

        # brand is NOT NULL in the schema -- violates the DB constraint, forcing
        # upsert() into its except/rollback branch without needing to fake psycopg2.
        broken_name = _unique_name("broken")
        broken_record = _fragrance(broken_name, brand=None)

        with pytest.raises(Exception):
            repository.upsert(broken_record)

        # The connection must still be usable afterward -- this is the whole point
        # of upsert() calling self.connection.rollback() in its except branch
        # (see repository.py docstring / NOTES.md): a per-item DB failure must not
        # poison the connection for the rest of CatalogSyncOrchestrator's run.
        good_name = _unique_name("after_failure")
        cleanup_names.append(good_name)
        result = repository.upsert(_fragrance(good_name))

        assert result.created is True
        with real_connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            assert cursor.fetchone() == (1,)
