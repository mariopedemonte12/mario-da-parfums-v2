"""Plain data types shared across this package's modules."""

from dataclasses import dataclass


@dataclass(frozen=True)
class FakeVendor:
    """One entry of the fixed fake-vendor catalog (vendor_catalog.py)."""

    name: str
    website_url: str


@dataclass(frozen=True)
class VendorRecord:
    """A row read back from `vendors` (real id, whatever name/website_url it has)."""

    id: int
    name: str
    website_url: str


@dataclass(frozen=True)
class FragranceRecord:
    """A row read from `fragrances` — only the fields this package needs."""

    id: str
    name: str


@dataclass(frozen=True)
class GeneratedListing:
    """One deterministically-generated (fragrance, vendor) listing, pre-upsert."""

    fragrance_id: str
    vendor_id: int
    size_ml: int
    price: int
    url: str
    in_stock: bool


@dataclass(frozen=True)
class ListingUpsertResult:
    """Outcome of a single ListingRepository.upsert() call."""

    created: bool


@dataclass
class RunOutcome:
    """End-of-run summary produced by PriceSyncOrchestrator.run()."""

    vendors_ensured: int
    listings_created: int
    listings_updated: int
    listings_failed: int
