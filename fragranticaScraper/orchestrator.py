"""Coordinates FragranticaScraper and FragranceRepository for one full run."""

from .models import SyncOutcome
from .repository import FragranceRepository
from .scraper import FragranticaScraper


class CatalogSyncOrchestrator:
    """Runs one catalog sync: scrape, validate, upsert, tally, log.

    Field-completeness discarding (missing name/brand) and per-item failure
    isolation live here — see specs/fragrantica-scraper.md.
    """

    def __init__(
        self,
        scraper: FragranticaScraper,
        repository: FragranceRepository,
    ) -> None:
        self.scraper = scraper
        self.repository = repository

    def run(self) -> SyncOutcome:
        """Iterate the scraper's catalog and upsert each valid record.

        A single item failing (missing required field, DB error, etc.) must
        not stop the run.
        """
        raise NotImplementedError
