"""Raw-SQL adapter for the `vendors` table (psycopg2, no ORM).

Must match backend/src/database/schema/vendor.schema.ts exactly: `id`
(serial), `name` (varchar 128, unique), `website_url` (varchar 255).
`created_at`/`updated_at` are server-set (DEFAULT NOW()) — never written here.
"""

from .models import FakeVendor, VendorRecord


class VendorRepository:
    """Ensures the fake vendor catalog exists, and reads back all vendors."""

    def __init__(self, connection) -> None:
        self.connection = connection

    def ensure_vendors(self, fake_vendors: list[FakeVendor]) -> int:
        """INSERT ... ON CONFLICT (name) DO NOTHING for each fake vendor.

        Never touches website_url of a vendor that already exists — an admin
        may have edited it since via the vendors CRUD (spec, "Vendors
        falsos"). Returns how many rows were actually newly inserted.
        """
        inserted = 0
        with self.connection.cursor() as cursor:
            for vendor in fake_vendors:
                cursor.execute(
                    """
                    INSERT INTO vendors (name, website_url)
                    VALUES (%s, %s)
                    ON CONFLICT (name) DO NOTHING
                    """,
                    (vendor.name, vendor.website_url),
                )
                inserted += cursor.rowcount
        self.connection.commit()
        return inserted

    def list_all(self) -> list[VendorRecord]:
        """All vendors currently in the table — not just the fake 5.

        Spec, "Vendors falsos": this schema has no active/inactive flag, so
        every vendor row counts as active for cross-join purposes.
        """
        with self.connection.cursor() as cursor:
            cursor.execute("SELECT id, name, website_url FROM vendors")
            rows = cursor.fetchall()
        return [
            VendorRecord(id=row[0], name=row[1], website_url=row[2]) for row in rows
        ]
