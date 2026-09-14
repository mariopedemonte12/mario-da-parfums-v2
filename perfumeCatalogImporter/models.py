"""Plain data types shared across this package's modules."""

from dataclasses import dataclass


@dataclass
class CatalogFragrance:
    """One perfume built from the Kaggle dataset row, before any DB interaction.

    `description` is synthetic (see description_generator.py) — never copied
    editorial text. `image_url` is always None: this dataset has no photos.
    `olfactory_family`/`target_audience`/`longevity` are the same cleaned
    `category`/`target_audience`/`longevity` values already used to build
    `description` — see specs/fragrance-notes-enrichment.md for why these are
    free-form varchar columns in the backend, not an enum.
    """

    name: str | None
    brand: str | None
    concentration: str | None
    description: str | None
    image_url: str | None
    olfactory_family: str | None
    target_audience: str | None
    longevity: str | None


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
