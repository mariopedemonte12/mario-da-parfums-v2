"""Coordinates KaggleCatalogSource and FragranceRepository for one full run."""

from .dataset_source import KaggleCatalogSource
from .models import SyncOutcome
from .repository import FragranceRepository


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
        not stop the run.
        """
        raise NotImplementedError
