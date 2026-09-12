"""Unit tests for PriceSyncOrchestrator -- fakes for all four collaborators,
no DB, no real randomness (see priceGenerator/CLAUDE.md, "Testing seams").
"""

from priceGenerator.models import (
    FakeVendor,
    FragranceRecord,
    GeneratedListing,
    ListingUpsertResult,
    VendorRecord,
)
from priceGenerator.orchestrator import PriceSyncOrchestrator


class FakeFragranceReader:
    def __init__(self, fragrances):
        self._fragrances = fragrances

    def list_all(self):
        return self._fragrances


class FakeVendorRepository:
    def __init__(self, vendors, ensured_count=0):
        self._vendors = vendors
        self.ensured_count = ensured_count

    def ensure_vendors(self, fake_vendors):
        return self.ensured_count

    def list_all(self):
        return self._vendors


class FakeListingRepository:
    def __init__(self, created_for=None, fail_for=None):
        self.created_for = created_for or set()
        self.fail_for = fail_for or set()
        self.upserted: list[GeneratedListing] = []

    def upsert(self, listing: GeneratedListing) -> ListingUpsertResult:
        key = (listing.fragrance_id, listing.vendor_id)
        if key in self.fail_for:
            raise RuntimeError(f"simulated failure for {key}")
        self.upserted.append(listing)
        return ListingUpsertResult(created=key in self.created_for)


class FakePriceGenerator:
    """Fixed, non-random output -- orchestrator tests aren't about pricing."""

    def generate(self, fragrance_id, vendor_id):
        return (39_990, 30, True)


def _orchestrator(fragrance_reader, vendor_repository, listing_repository, price_generator=None):
    return PriceSyncOrchestrator(
        fragrance_reader=fragrance_reader,
        vendor_repository=vendor_repository,
        listing_repository=listing_repository,
        price_generator=price_generator or FakePriceGenerator(),
        fake_vendors=[FakeVendor(name="X", website_url="https://x.example.com")],
    )


def test_cross_join_covers_every_fragrance_vendor_pair():
    fragrances = [
        FragranceRecord(id="f1", name="Frag One"),
        FragranceRecord(id="f2", name="Frag Two"),
    ]
    vendors = [
        VendorRecord(id=1, name="V1", website_url="https://v1.example.com"),
        VendorRecord(id=2, name="V2", website_url="https://v2.example.com"),
    ]
    listing_repo = FakeListingRepository(created_for={(f.id, v.id) for f in fragrances for v in vendors})

    outcome = _orchestrator(FakeFragranceReader(fragrances), FakeVendorRepository(vendors), listing_repo).run()

    processed_pairs = {(listing.fragrance_id, listing.vendor_id) for listing in listing_repo.upserted}
    expected_pairs = {(f.id, v.id) for f in fragrances for v in vendors}
    assert processed_pairs == expected_pairs
    assert outcome.listings_created == 4
    assert outcome.listings_failed == 0


def test_run_outcome_tallies_created_vs_updated():
    fragrances = [FragranceRecord(id="f1", name="Frag One")]
    vendors = [
        VendorRecord(id=1, name="V1", website_url="https://v1.example.com"),
        VendorRecord(id=2, name="V2", website_url="https://v2.example.com"),
    ]
    listing_repo = FakeListingRepository(created_for={("f1", 1)})  # vendor 2 -> update

    outcome = _orchestrator(FakeFragranceReader(fragrances), FakeVendorRepository(vendors), listing_repo).run()

    assert outcome.listings_created == 1
    assert outcome.listings_updated == 1


def test_one_failing_combination_does_not_abort_the_rest():
    fragrances = [
        FragranceRecord(id="f1", name="Frag One"),
        FragranceRecord(id="f2", name="Frag Two"),
    ]
    vendors = [VendorRecord(id=1, name="V1", website_url="https://v1.example.com")]
    listing_repo = FakeListingRepository(
        created_for={("f1", 1), ("f2", 1)},
        fail_for={("f2", 1)},
    )

    outcome = _orchestrator(FakeFragranceReader(fragrances), FakeVendorRepository(vendors), listing_repo).run()

    assert outcome.listings_failed == 1
    assert outcome.listings_created == 1
    processed = {(listing.fragrance_id, listing.vendor_id) for listing in listing_repo.upserted}
    assert processed == {("f1", 1)}


def test_a_failing_vendor_does_not_skip_the_remaining_vendors_for_the_same_fragrance():
    """Distinguishes `continue` from `break` in the orchestrator's per-item
    except clause: with a single fragrance and two vendors, a failure on the
    first vendor must still let the second vendor (same fragrance) be
    processed -- `break` would silently drop it instead.
    """
    fragrances = [FragranceRecord(id="f1", name="Frag One")]
    vendors = [
        VendorRecord(id=1, name="V1", website_url="https://v1.example.com"),
        VendorRecord(id=2, name="V2", website_url="https://v2.example.com"),
    ]
    listing_repo = FakeListingRepository(
        created_for={("f1", 2)},
        fail_for={("f1", 1)},
    )

    outcome = _orchestrator(FakeFragranceReader(fragrances), FakeVendorRepository(vendors), listing_repo).run()

    assert outcome.listings_failed == 1
    assert outcome.listings_created == 1
    processed = {(listing.fragrance_id, listing.vendor_id) for listing in listing_repo.upserted}
    assert processed == {("f1", 2)}


def test_vendors_ensured_passes_through_from_vendor_repository():
    outcome = _orchestrator(
        FakeFragranceReader([]),
        FakeVendorRepository([], ensured_count=3),
        FakeListingRepository(),
    ).run()

    assert outcome.vendors_ensured == 3


def test_run_covers_every_vendor_from_list_all_including_a_manually_added_extra():
    fragrances = [FragranceRecord(id="f1", name="Frag One")]
    vendors = [
        VendorRecord(id=1, name="Fake Vendor", website_url="https://fake.example.com"),
        VendorRecord(id=99, name="Manually Added Vendor", website_url="https://extra.example.com"),
    ]
    listing_repo = FakeListingRepository(created_for={("f1", 1), ("f1", 99)})

    outcome = _orchestrator(FakeFragranceReader(fragrances), FakeVendorRepository(vendors), listing_repo).run()

    assert outcome.listings_created == 2
    processed_vendor_ids = {listing.vendor_id for listing in listing_repo.upserted}
    assert processed_vendor_ids == {1, 99}


def test_listing_url_built_from_real_vendor_website_and_fragrance_name():
    fragrances = [FragranceRecord(id="f1", name="Chanel N°5")]
    vendors = [VendorRecord(id=1, name="V1", website_url="https://v1.example.com")]
    listing_repo = FakeListingRepository(created_for={("f1", 1)})

    _orchestrator(FakeFragranceReader(fragrances), FakeVendorRepository(vendors), listing_repo).run()

    [listing] = listing_repo.upserted
    assert listing.url == "https://v1.example.com/producto/chanel-n5-30ml"  # FakePriceGenerator -> size_ml=30
