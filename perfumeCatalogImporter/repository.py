"""Raw-SQL adapter for the `fragrances` table (psycopg2, no ORM).

The only module allowed to import psycopg2 or write SQL. Must match
backend/src/database/schema/fragrance.schema.ts exactly — see
perfumeCatalogImporter/CLAUDE.md for the column-name gotchas (image_url, uuid
id, no updated_at trigger).
"""

from .models import CatalogFragrance, UpsertResult


class FragranceRepository:
    """Upserts CatalogFragrance records into the `fragrances` table."""

    def __init__(self, connection) -> None:
        self.connection = connection

    def upsert(self, record: CatalogFragrance) -> UpsertResult:
        """INSERT ... ON CONFLICT (name) DO UPDATE, bumping updated_at explicitly."""
        raise NotImplementedError

    def fetch_search_corpus(self) -> list[tuple[str, str]]:
        """Return (name, description) for every fragrance with a description.

        Read-only — feeds PerfumeSimilarityIndex.sync() (see similarity.py,
        index_sync.py). A fragrance with a null description (shouldn't
        happen for rows this package's own import wrote, but the CRUD admin
        backend can create one without a description) is excluded rather
        than fed to the encoder as an empty string.
        """
        with self.connection.cursor() as cursor:
            cursor.execute("SELECT name, description FROM fragrances WHERE description IS NOT NULL")
            return [(name, description) for name, description in cursor.fetchall()]
