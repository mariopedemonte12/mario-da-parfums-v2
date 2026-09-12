"""CLI entrypoint: build repos + generator from config, run the orchestrator once.

Batch script — connects, runs one sync, prints a summary, exits. Not a daemon:
no internal scheduler/cron (spec, "Empaquetado como imagen Docker").
"""

import logging
import sys

import psycopg2

from .config import load_config
from .fragrance_reader import FragranceReader
from .listing_repository import ListingRepository
from .orchestrator import PriceSyncOrchestrator
from .price_generator import PriceGenerator
from .vendor_catalog import FAKE_VENDORS
from .vendor_repository import VendorRepository

logger = logging.getLogger(__name__)


def main() -> int:
    config = load_config()
    logging.basicConfig(
        level=config.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    connection = psycopg2.connect(config.database_url)
    connection.autocommit = False
    try:
        orchestrator = PriceSyncOrchestrator(
            fragrance_reader=FragranceReader(connection),
            vendor_repository=VendorRepository(connection),
            listing_repository=ListingRepository(connection),
            price_generator=PriceGenerator(),
            fake_vendors=FAKE_VENDORS,
        )
        outcome = orchestrator.run()
    finally:
        connection.close()

    logger.info(
        "run summary: vendors_ensured=%d listings_created=%d listings_updated=%d listings_failed=%d",
        outcome.vendors_ensured,
        outcome.listings_created,
        outcome.listings_updated,
        outcome.listings_failed,
    )

    return 0 if outcome.listings_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
