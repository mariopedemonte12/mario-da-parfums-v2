"""Fixtures for priceGenerator's integration tests (real Postgres).

Repositories under test call connection.commit()/rollback() themselves
(see listing_repository.py's explicit rollback) -- so wrapping a test in one
outer transaction and rolling *that* back at the end would not undo what the
repository already committed mid-test. Cleanup here is therefore always
explicit: every factory fixture tracks exactly the row ids it inserted and
deletes precisely those in its teardown, so the shared dev DB (which had
exactly one unrelated fixture vendor, 'Direct Probe...', when this suite was
written) is left as it was found.
"""

import os
import uuid

import psycopg2
import pytest

DEFAULT_TEST_DATABASE_URL = (
    "postgresql://mario_da_parfums:mario_da_parfums@localhost:5432/mario_da_parfums"
)


@pytest.fixture
def db_connection():
    database_url = os.environ.get("DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
    connection = psycopg2.connect(database_url)
    connection.autocommit = False
    yield connection
    connection.close()


@pytest.fixture
def unique_suffix():
    return uuid.uuid4().hex[:8]


@pytest.fixture
def fragrance_factory(db_connection):
    """Yields make(name) -> fragrance_id (uuid str); deletes every fragrance
    it created afterwards. Deleting a fragrance cascades to its listings
    (listings.perfume_id has onDelete: cascade in the schema), so no
    separate listing cleanup is needed for rows created through this
    fixture alone.
    """
    created_ids: list[str] = []

    def make(name: str, brand: str = "ZZTEST Brand") -> str:
        with db_connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO fragrances (name, brand) VALUES (%s, %s) RETURNING id",
                (name, brand),
            )
            (fragrance_id,) = cursor.fetchone()
        db_connection.commit()
        created_ids.append(str(fragrance_id))
        return str(fragrance_id)

    yield make

    if created_ids:
        db_connection.rollback()  # recover if the test body left the transaction aborted
        with db_connection.cursor() as cursor:
            cursor.execute("DELETE FROM fragrances WHERE id = ANY(%s::uuid[])", (created_ids,))
        db_connection.commit()


@pytest.fixture
def vendor_factory(db_connection):
    """Yields make(name, website_url=...) -> vendor_id (int); deletes every
    vendor it created afterwards. Vendors have no cascade from listings, so
    any listing referencing a tracked vendor is deleted first.
    """
    created_ids: list[int] = []

    def make(name: str, website_url: str = "https://zztest-vendor.example.com") -> int:
        with db_connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO vendors (name, website_url) VALUES (%s, %s) RETURNING id",
                (name, website_url),
            )
            (vendor_id,) = cursor.fetchone()
        db_connection.commit()
        created_ids.append(vendor_id)
        return vendor_id

    yield make

    if created_ids:
        db_connection.rollback()  # recover if the test body left the transaction aborted
        with db_connection.cursor() as cursor:
            cursor.execute("DELETE FROM listings WHERE vendor_id = ANY(%s)", (created_ids,))
            cursor.execute("DELETE FROM vendors WHERE id = ANY(%s)", (created_ids,))
        db_connection.commit()


@pytest.fixture
def vendor_name_cleanup(db_connection):
    """For tests that insert vendors by exact name via VendorRepository
    itself (not via vendor_factory) -- append names here and they, plus any
    listings referencing them, are deleted afterwards.
    """
    names: list[str] = []
    yield names
    if names:
        db_connection.rollback()  # recover if the test body left the transaction aborted
        with db_connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM listings WHERE vendor_id IN (SELECT id FROM vendors WHERE name = ANY(%s))",
                (names,),
            )
            cursor.execute("DELETE FROM vendors WHERE name = ANY(%s)", (names,))
        db_connection.commit()
