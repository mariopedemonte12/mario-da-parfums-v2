"""End-to-end integration tests for PriceSyncOrchestrator against real
Postgres, wired exactly like main.py (real FAKE_VENDORS, real PriceGenerator,
real repositories) against fresh throwaway fragrances.

Run with `pytest -m integration`. Every test cleans up the real fake vendors
plus any fragrances/listings it touches, so the shared dev DB is left as it
was found.
"""

import pytest

from priceGenerator.fragrance_reader import FragranceReader
from priceGenerator.listing_repository import ListingRepository
from priceGenerator.models import VendorRecord
from priceGenerator.orchestrator import PriceSyncOrchestrator
from priceGenerator.price_generator import PriceGenerator, slugify
from priceGenerator.vendor_catalog import FAKE_VENDORS
from priceGenerator.vendor_repository import VendorRepository

pytestmark = pytest.mark.integration


def _make_orchestrator(connection, vendor_repository=None):
    return PriceSyncOrchestrator(
        fragrance_reader=FragranceReader(connection),
        vendor_repository=vendor_repository or VendorRepository(connection),
        listing_repository=ListingRepository(connection),
        price_generator=PriceGenerator(),
        fake_vendors=FAKE_VENDORS,
    )


def _current_vendor_count(connection) -> int:
    """Vendors already in the table before ensure_vendors() runs -- the spec
    requires cross-joining against *every* vendor row (no active flag), and
    this shared dev DB may carry unrelated fixture vendors (e.g. the
    'Direct Probe...' vendor present when this suite was written), so tests
    must not hardcode len(FAKE_VENDORS) as the total vendor count.
    """
    with connection.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM vendors")
        (count,) = cursor.fetchone()
    return count


@pytest.fixture
def fake_vendor_cleanup(db_connection):
    yield
    db_connection.rollback()  # recover if the test body left the transaction aborted
    names = [v.name for v in FAKE_VENDORS]
    with db_connection.cursor() as cursor:
        cursor.execute(
            "DELETE FROM listings WHERE vendor_id IN (SELECT id FROM vendors WHERE name = ANY(%s))",
            (names,),
        )
        cursor.execute("DELETE FROM vendors WHERE name = ANY(%s)", (names,))
    db_connection.commit()


def test_run_covers_every_fragrance_times_every_fake_vendor(
    db_connection, fragrance_factory, unique_suffix, fake_vendor_cleanup
):
    f1 = fragrance_factory(f"ZZTEST Frag One {unique_suffix}")
    f2 = fragrance_factory(f"ZZTEST Frag Two {unique_suffix}")
    baseline_vendor_count = _current_vendor_count(db_connection)
    orchestrator = _make_orchestrator(db_connection)

    outcome = orchestrator.run()

    expected_vendors = baseline_vendor_count + len(FAKE_VENDORS)
    assert outcome.vendors_ensured == len(FAKE_VENDORS)
    assert outcome.listings_created == 2 * expected_vendors
    assert outcome.listings_failed == 0
    with db_connection.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM listings WHERE perfume_id = ANY(%s::uuid[])", ([f1, f2],))
        (count,) = cursor.fetchone()
    assert count == 2 * expected_vendors


def test_run_includes_a_manually_added_extra_vendor_in_coverage(
    db_connection, fragrance_factory, vendor_factory, unique_suffix, fake_vendor_cleanup
):
    fragrance_id = fragrance_factory(f"ZZTEST Frag {unique_suffix}")
    extra_vendor_id = vendor_factory(f"ZZTEST Manually Added Vendor {unique_suffix}")
    baseline_vendor_count = _current_vendor_count(db_connection)  # already includes the extra vendor
    orchestrator = _make_orchestrator(db_connection)

    outcome = orchestrator.run()

    assert outcome.listings_created == baseline_vendor_count + len(FAKE_VENDORS)
    with db_connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM listings WHERE perfume_id = %s AND vendor_id = %s",
            (fragrance_id, extra_vendor_id),
        )
        (count,) = cursor.fetchone()
    assert count == 1


def test_running_twice_only_updates_the_same_rows_with_the_same_values(
    db_connection, fragrance_factory, unique_suffix, fake_vendor_cleanup
):
    fragrance_id = fragrance_factory(f"ZZTEST Frag {unique_suffix}")
    baseline_vendor_count = _current_vendor_count(db_connection)
    orchestrator = _make_orchestrator(db_connection)

    first_outcome = orchestrator.run()
    with db_connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, price, size_ml, in_stock FROM listings WHERE perfume_id=%s ORDER BY vendor_id",
            (fragrance_id,),
        )
        first_rows = cursor.fetchall()

    second_outcome = orchestrator.run()
    with db_connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, price, size_ml, in_stock FROM listings WHERE perfume_id=%s ORDER BY vendor_id",
            (fragrance_id,),
        )
        second_rows = cursor.fetchall()

    expected_vendors = baseline_vendor_count + len(FAKE_VENDORS)
    assert first_outcome.listings_created == expected_vendors
    assert second_outcome.listings_created == 0
    assert second_outcome.listings_updated == expected_vendors
    assert first_rows == second_rows  # same row ids, same price/size/in_stock -- pure update


def test_listing_url_uses_real_vendor_url_and_slugified_fragrance_name(
    db_connection, fragrance_factory, fake_vendor_cleanup
):
    fragrance_name = "Chanel N°5"
    fragrance_id = fragrance_factory(fragrance_name)
    baseline_vendor_count = _current_vendor_count(db_connection)
    orchestrator = _make_orchestrator(db_connection)

    orchestrator.run()

    with db_connection.cursor() as cursor:
        cursor.execute(
            "SELECT v.website_url, l.size_ml, l.url FROM listings l "
            "JOIN vendors v ON v.id = l.vendor_id WHERE l.perfume_id = %s",
            (fragrance_id,),
        )
        rows = cursor.fetchall()
    assert len(rows) == baseline_vendor_count + len(FAKE_VENDORS)
    for website_url, size_ml, url in rows:
        assert url == f"{website_url}/producto/{slugify(fragrance_name)}-{size_ml}ml"


def test_partial_failure_does_not_abort_the_rest_of_the_run(
    db_connection, fragrance_factory, unique_suffix, fake_vendor_cleanup
):
    fragrance_id = fragrance_factory(f"ZZTEST Good Frag {unique_suffix}")
    baseline_vendor_count = _current_vendor_count(db_connection)

    class VendorRepositoryWithGhostVendor(VendorRepository):
        """Injects one vendor record with a nonexistent id after the real
        ensure_vendors()/list_all(), so exactly one (fragrance, vendor)
        combination violates the listings.vendor_id FK and fails --
        exercising the real rollback in listing_repository.py (spec point
        10) end-to-end, without ever actually persisting the ghost vendor.
        """

        def list_all(self):
            ghost = VendorRecord(id=2_147_483_647, name="ghost", website_url="https://ghost.example.com")
            return super().list_all() + [ghost]

    orchestrator = _make_orchestrator(db_connection, vendor_repository=VendorRepositoryWithGhostVendor(db_connection))

    outcome = orchestrator.run()

    expected_real_vendors = baseline_vendor_count + len(FAKE_VENDORS)
    assert outcome.listings_failed == 1
    assert outcome.listings_created == expected_real_vendors  # the real vendors still succeeded
    with db_connection.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM listings WHERE perfume_id = %s", (fragrance_id,))
        (count,) = cursor.fetchone()
    assert count == expected_real_vendors
