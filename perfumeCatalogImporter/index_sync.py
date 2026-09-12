"""Keeps the on-disk embeddings index in line with the `fragrances` table.

This is responsibility #1 of the search server (see
specs/perfume-similarity-search.md): before serving any search request, the
embeddings on disk must cover every fragrance currently in Postgres, using
the encoder to fill in whatever's missing or stale. Runs once at server
startup (see app.py's lifespan) — there is no live rebuild-without-restart
endpoint yet, see that spec's "Explícitamente fuera de alcance".
"""

import logging
from pathlib import Path

from .repository import FragranceRepository
from .similarity import PerfumeSimilarityIndex, SyncStats

logger = logging.getLogger(__name__)


class IndexSyncService:
    """Coordinates FragranceRepository (source of truth) and PerfumeSimilarityIndex."""

    def __init__(
        self,
        repository: FragranceRepository,
        index: PerfumeSimilarityIndex,
        embeddings_path: Path | str,
    ) -> None:
        self.repository = repository
        self.index = index
        self.embeddings_path = Path(embeddings_path)

    def ensure_up_to_date(self) -> SyncStats:
        """Load the on-disk index (if any), sync it against the DB, save if changed."""
        records = self.repository.fetch_search_corpus()
        if not records:
            logger.warning(
                "fragrances table has no rows with a description — "
                "search will return no results until perfumeCatalogImporter runs"
            )

        if self.embeddings_path.exists():
            self.index.load(self.embeddings_path)

        stats = self.index.sync(records)

        if stats.added or stats.updated or stats.removed:
            self.index.save(self.embeddings_path)
            logger.info(
                "Embeddings index synced and saved to %s (added=%d updated=%d removed=%d unchanged=%d)",
                self.embeddings_path,
                stats.added,
                stats.updated,
                stats.removed,
                stats.unchanged,
            )
        else:
            logger.info("Embeddings index already up to date (%d fragrances)", stats.unchanged)

        return stats
