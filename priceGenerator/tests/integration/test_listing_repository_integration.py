"""Integration tests for ListingRepository against a real Postgres instance.

Run with `pytest -m integration`. Covers the upsert contract that only a real
unique index/constraint can verify: same row reused on re-run (not a new
row), and the explicit rollback in listing_repository.py that keeps the
connection usable after one failed statement (spec point 10 /
priceGenerator/CLAUDE.md).
"""

import time

import pytest

from priceGenerator.listing_repository import ListingRepository
from priceGenerator.models import GeneratedListing

pytestmark = pytest.mark.integration


def _listing(
    fragrance_id,
    vendor_id,
    size_ml=50,
    price=39_990,
    url="https://a.example.com/producto/x-50ml",
    in_stock=True,
):
    return GeneratedListing(
        fragrance_id=fragrance_id,
        vendor_id=vendor_id,
        size_ml=size_ml,
        price=price,
        url=url,
        in_stock=in_stock,
    )


def test_upsert_creates_a_new_listing(db_connection, fragrance_factory, vendor_factory, unique_suffix):
    fragrance_id = fragrance_factory(f"ZZTEST Frag {unique_suffix}")
    vendor_id = vendor_factory(f"ZZTEST Vendor {unique_suffix}")
    repo = ListingRepository(db_connection)

    result = repo.upsert(_listing(fragrance_id, vendor_id))

    assert result.created is True
    with db_connection.cursor() as cursor:
        cursor.execute(
            "SELECT price, size_ml, in_stock FROM listings WHERE vendor_id=%s AND perfume_id=%s AND size_ml=%s",
            (vendor_id, fragrance_id, 50),
        )
        row = cursor.fetchone()
    assert row == (39_990, 50, True)


def test_upsert_twice_updates_the_same_row_without_duplicating(
    db_connection, fragrance_factory, vendor_factory, unique_suffix
):
    fragrance_id = fragrance_factory(f"ZZTEST Frag {unique_suffix}")
    vendor_id = vendor_factory(f"ZZTEST Vendor {unique_suffix}")
    repo = ListingRepository(db_connection)

    first_result = repo.upsert(_listing(fragrance_id, vendor_id, price=39_990))
    with db_connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, scraped_at FROM listings WHERE vendor_id=%s AND perfume_id=%s AND size_ml=%s",
            (vendor_id, fragrance_id, 50),
        )
        first_id, first_scraped_at = cursor.fetchone()

    time.sleep(0.1)  # make sure scraped_at can visibly advance between the two upserts
    second_result = repo.upsert(_listing(fragrance_id, vendor_id, price=44_990))

    with db_connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, price, scraped_at FROM listings WHERE vendor_id=%s AND perfume_id=%s AND size_ml=%s",
            (vendor_id, fragrance_id, 50),
        )
        second_id, price, second_scraped_at = cursor.fetchone()
        cursor.execute(
            "SELECT count(*) FROM listings WHERE vendor_id=%s AND perfume_id=%s AND size_ml=%s",
            (vendor_id, fragrance_id, 50),
        )
        (count,) = cursor.fetchone()

    assert first_result.created is True
    assert second_result.created is False
    assert second_id == first_id  # same row, not a new one
    assert count == 1
    assert price == 44_990
    assert second_scraped_at > first_scraped_at


def test_upsert_different_size_ml_creates_a_separate_row(
    db_connection, fragrance_factory, vendor_factory, unique_suffix
):
    fragrance_id = fragrance_factory(f"ZZTEST Frag {unique_suffix}")
    vendor_id = vendor_factory(f"ZZTEST Vendor {unique_suffix}")
    repo = ListingRepository(db_connection)

    repo.upsert(_listing(fragrance_id, vendor_id, size_ml=50))
    result = repo.upsert(_listing(fragrance_id, vendor_id, size_ml=75))

    assert result.created is True
    with db_connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM listings WHERE vendor_id=%s AND perfume_id=%s", (vendor_id, fragrance_id)
        )
        (count,) = cursor.fetchone()
    assert count == 2


def test_upsert_rolls_back_on_failure_and_leaves_the_connection_usable(
    db_connection, fragrance_factory, vendor_factory, unique_suffix
):
    fragrance_id = fragrance_factory(f"ZZTEST Frag {unique_suffix}")
    vendor_id = vendor_factory(f"ZZTEST Vendor {unique_suffix}")
    repo = ListingRepository(db_connection)
    nonexistent_vendor_id = 2_147_483_647  # max int4, no matching vendors row -> FK violation

    with pytest.raises(Exception):
        repo.upsert(_listing(fragrance_id, nonexistent_vendor_id))

    # Without the explicit rollback in listing_repository.py, the connection
    # would still be in an aborted-transaction state here and this second,
    # otherwise-valid upsert would also fail (spec point 10 / CLAUDE.md).
    result = repo.upsert(_listing(fragrance_id, vendor_id))
    assert result.created is True
