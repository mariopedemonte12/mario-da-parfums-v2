"""Coordinates one full price-generation run: vendors, fragrances, listings."""

import logging

from .fragrance_reader import FragranceReader
from .listing_repository import ListingRepository
from .models import FakeVendor, GeneratedListing, RunOutcome
from .price_generator import PriceGenerator, build_listing_url
from .vendor_repository import VendorRepository

logger = logging.getLogger(__name__)


class PriceSyncOrchestrator:
    """Runs one sync: ensure vendors, cross-join fragrances x vendors, upsert.

    Field-completeness isn't a concern here (fragrances are already valid
    rows in the DB) — the per-item isolation that matters is a single
    upsert failing without aborting the rest of the run (spec, point 10).
    """

    def __init__(
        self,
        fragrance_reader: FragranceReader,
        vendor_repository: VendorRepository,
        listing_repository: ListingRepository,
        price_generator: PriceGenerator,
        fake_vendors: list[FakeVendor],
    ) -> None:
        self.fragrance_reader = fragrance_reader
        self.vendor_repository = vendor_repository
        self.listing_repository = listing_repository
        self.price_generator = price_generator
        self.fake_vendors = fake_vendors

    def run(self) -> RunOutcome:
        vendors_ensured = self.vendor_repository.ensure_vendors(self.fake_vendors)
        vendors = self.vendor_repository.list_all()
        fragrances = self.fragrance_reader.list_all()

        created = 0
        updated = 0
        failed = 0

        for fragrance in fragrances:
            for vendor in vendors:
                try:
                    price, size_ml, in_stock = self.price_generator.generate(
                        fragrance.id, vendor.id
                    )
                    url = build_listing_url(vendor.website_url, fragrance.name, size_ml)
                    listing = GeneratedListing(
                        fragrance_id=fragrance.id,
                        vendor_id=vendor.id,
                        size_ml=size_ml,
                        price=price,
                        url=url,
                        in_stock=in_stock,
                    )
                    result = self.listing_repository.upsert(listing)
                except Exception:
                    failed += 1
                    logger.exception(
                        "failed: fragrance=%s vendor=%s", fragrance.name, vendor.name
                    )
                    continue

                if result.created:
                    created += 1
                    outcome = "created"
                else:
                    updated += 1
                    outcome = "updated"
                logger.info(
                    "%s: fragrance=%s vendor=%s size_ml=%d price=%d in_stock=%s",
                    outcome,
                    fragrance.name,
                    vendor.name,
                    size_ml,
                    price,
                    in_stock,
                )

        return RunOutcome(
            vendors_ensured=vendors_ensured,
            listings_created=created,
            listings_updated=updated,
            listings_failed=failed,
        )
