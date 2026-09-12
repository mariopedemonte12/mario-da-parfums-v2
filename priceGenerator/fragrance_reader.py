"""Read-only raw-SQL adapter for the `fragrances` table (psycopg2, no ORM).

This module and vendor_repository.py/listing_repository.py are the only
modules allowed to import psycopg2 or write SQL. Must match
backend/src/database/schema/fragrance.schema.ts (uuid `id`, varchar `name`).
"""

from .models import FragranceRecord


class FragranceReader:
    """Reads all fragrances this generator needs to produce listings for."""

    def __init__(self, connection) -> None:
        self.connection = connection

    def list_all(self) -> list[FragranceRecord]:
        with self.connection.cursor() as cursor:
            cursor.execute("SELECT id, name FROM fragrances")
            rows = cursor.fetchall()
        return [FragranceRecord(id=str(row[0]), name=row[1]) for row in rows]
