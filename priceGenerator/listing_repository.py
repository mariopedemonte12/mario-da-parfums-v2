"""Raw-SQL adapter for the `listings` table (psycopg2, no ORM).

Must match backend/src/database/schema/listing.schema.ts exactly: `perfume_id`
(uuid FK to fragrances.id), `vendor_id` (integer FK to vendors.id), `size_ml`,
`price` (integer CLP), `url` (varchar 500), `in_stock` (boolean), `scraped_at`
(timestamp) — conflict target is the unique index on
(vendor_id, perfume_id, size_ml).
"""

from .models import GeneratedListing, ListingUpsertResult


class ListingRepository:
    """Upserts GeneratedListing records into the `listings` table.

    One commit per listing (not one giant transaction) so a single failed
    upsert can be rolled back and skipped without losing the rest of the run.
    """

    def __init__(self, connection) -> None:
        self.connection = connection

    def upsert(self, listing: GeneratedListing) -> ListingUpsertResult:
        try:
            with self.connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO listings
                        (perfume_id, vendor_id, size_ml, price, url, in_stock, scraped_at)
                    VALUES (%s, %s, %s, %s, %s, %s, now())
                    ON CONFLICT (vendor_id, perfume_id, size_ml)
                    DO UPDATE SET
                        price = EXCLUDED.price,
                        url = EXCLUDED.url,
                        in_stock = EXCLUDED.in_stock,
                        scraped_at = now()
                    RETURNING (xmax = 0) AS inserted
                    """,
                    (
                        listing.fragrance_id,
                        listing.vendor_id,
                        listing.size_ml,
                        listing.price,
                        listing.url,
                        listing.in_stock,
                    ),
                )
                (created,) = cursor.fetchone()
        except Exception:
            # A failed statement leaves the connection in an aborted-
            # transaction state until rolled back — without this, every
            # subsequent upsert in the run would fail too (spec point 10:
            # one bad combination must not take down the rest of the run).
            self.connection.rollback()
            raise

        self.connection.commit()
        return ListingUpsertResult(created=bool(created))
