"""Coordinates KaggleCatalogSource and FragranceRepository for one full run."""

import logging

from .dataset_source import KaggleCatalogSource
from .models import SyncOutcome
from .repository import FragranceRepository

logger = logging.getLogger(__name__)


class CatalogSyncOrchestrator:
    """Runs one catalog import: read dataset, validate, upsert, tally, log.

    Field-completeness discarding (missing name/brand) and per-item failure
    isolation live here — see specs/perfume-catalog-import.md.
    """

    def __init__(
        self,
        source: KaggleCatalogSource,
        repository: FragranceRepository,
    ) -> None:
        self.source = source
        self.repository = repository

    def run(self) -> SyncOutcome:
        """Iterate the dataset source's catalog and upsert each valid record.

        A single item failing (missing required field, DB error, etc.) must
        not stop the run. A second row within the same run sharing a
        (brand, name) key with one already processed is a point failure too
        — it never reaches repository.upsert(), so a genuine ambiguous
        collision in the source dataset can't silently overwrite the first
        row's data (see specs/perfume-catalog-import.md).
        """
        created = updated = discarded = failed = 0
        seen_keys: set[tuple[str, str]] = set()

        for record in self.source.iter_catalog():
            if not record.name or not record.brand:
                discarded += 1
                logger.warning("Discarded row missing name/brand: %r", record)
                continue

            key = (record.brand, record.name)
            if key in seen_keys:
                failed += 1
                logger.warning("Failed row: (brand, name) collision within this run: %r", key)
                continue
            seen_keys.add(key)

            try:
                result = self.repository.upsert(record)
            except Exception:
                failed += 1
                logger.exception("Failed to upsert %r", record.name)
                continue

            if result.created:
                created += 1
                logger.info("Created %s", result.name)
            else:
                updated += 1
                logger.info("Updated %s", result.name)

        outcome = SyncOutcome(created=created, updated=updated, discarded=discarded, failed=failed)
        logger.info(
            "Catalog sync finished: created=%d updated=%d discarded=%d failed=%d",
            outcome.created,
            outcome.updated,
            outcome.discarded,
            outcome.failed,
        )
        return outcome
