"""Raw-SQL adapter for the `fragrances` table (psycopg2, no ORM).

The only module allowed to import psycopg2 or write SQL. Must match
backend/src/database/schema/fragrance.schema.ts exactly — see
fragranticaScraper/CLAUDE.md for the column-name gotchas (image_url, uuid id,
no updated_at trigger).
"""

from .models import ScrapedFragrance, UpsertResult


class FragranceRepository:
    """Upserts ScrapedFragrance records into the `fragrances` table."""

    def __init__(self, connection) -> None:
        self.connection = connection

    def upsert(self, record: ScrapedFragrance) -> UpsertResult:
        """INSERT ... ON CONFLICT (name) DO UPDATE, bumping updated_at explicitly."""
        raise NotImplementedError
