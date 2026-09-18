"""Raw-SQL adapter for the `fragrances` table (psycopg2, no ORM).

The only module allowed to import psycopg2 or write SQL. Must match
backend/src/database/schema/fragrance.schema.ts exactly — see
similarityServer/CLAUDE.md for the column-name gotchas (image_url, uuid
id, no updated_at trigger, olfactory_family/target_audience/longevity added by
specs/fragrance-notes-enrichment.md).
"""

from .models import CatalogFragrance, UpsertResult


class FragranceRepository:
    """Upserts CatalogFragrance records into the `fragrances` table."""

    def __init__(self, connection) -> None:
        self.connection = connection

    def upsert(self, record: CatalogFragrance) -> UpsertResult:
        """INSERT ... ON CONFLICT (name, brand) DO UPDATE, bumping updated_at explicitly.

        Commits its own transaction per call (see CLAUDE.md: "commit per
        fragrance, not one giant transaction"), rolling back on failure so a
        DB error on one record doesn't poison the connection for the next
        one — CatalogSyncOrchestrator relies on this to isolate per-item
        failures.

        `created` distinguishes the INSERT branch from the DO UPDATE branch
        via `created_at = updated_at`: the INSERT branch never touches
        `updated_at` explicitly (it falls back to its own `defaultNow()`,
        evaluated at the same transaction timestamp as `created_at`'s), so
        the two only match on a fresh insert.
        """
        try:
            with self.connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO fragrances (
                        name, brand, concentration, description, image_url,
                        olfactory_family, target_audience, longevity
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (name, brand) DO UPDATE SET
                        brand = EXCLUDED.brand,
                        concentration = EXCLUDED.concentration,
                        description = EXCLUDED.description,
                        image_url = EXCLUDED.image_url,
                        olfactory_family = EXCLUDED.olfactory_family,
                        target_audience = EXCLUDED.target_audience,
                        longevity = EXCLUDED.longevity,
                        updated_at = now()
                    RETURNING (created_at = updated_at) AS was_insert
                    """,
                    (
                        record.name,
                        record.brand,
                        record.concentration,
                        record.description,
                        record.image_url,
                        record.olfactory_family,
                        record.target_audience,
                        record.longevity,
                    ),
                )
                (was_insert,) = cursor.fetchone()
        except Exception:
            self.connection.rollback()
            raise

        self.connection.commit()
        return UpsertResult(name=record.name, created=bool(was_insert))

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
