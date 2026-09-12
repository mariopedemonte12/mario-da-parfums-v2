"""Plain data types shared between scraper.py, repository.py and orchestrator.py."""

from dataclasses import dataclass


@dataclass
class ScrapedFragrance:
    """One perfume as extracted from Fragrantica, before any DB interaction."""

    name: str | None
    brand: str | None
    concentration: str | None
    description: str | None
    image_url: str | None


@dataclass
class UpsertResult:
    """Outcome of a single FragranceRepository.upsert() call."""

    name: str
    created: bool


@dataclass
class SyncOutcome:
    """End-of-run summary produced by CatalogSyncOrchestrator.run()."""

    created: int
    updated: int
    discarded: int
    failed: int
