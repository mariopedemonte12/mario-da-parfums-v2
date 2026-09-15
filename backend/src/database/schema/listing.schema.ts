import { vendors } from './vendor.schema.js';
import { fragrances } from './fragrance.schema.js';
import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const listings = pgTable(
  'listings',
  {
    id: serial('id').primaryKey(),
    fragranceId: uuid('perfume_id')
      .references(() => fragrances.id, { onDelete: 'cascade' })
      .notNull(),
    vendorId: integer('vendor_id')
      .references(() => vendors.id)
      .notNull(),
    sizeMl: integer('size_ml').notNull(),
    price: integer('price').notNull(),
    url: varchar('url', { length: 500 }).notNull(),
    inStock: boolean('in_stock').default(true).notNull(),
    scrapedAt: timestamp('scraped_at').defaultNow().notNull(),
  },
  (table) => [
    index('listings_fragrance_id_idx').on(table.fragranceId),
    // listings_vendor_id_idx (single-column) dropped: by leftmost-prefix
    // rule, the two composite indexes below already serve any equality
    // lookup on vendor_id alone — see src/database/NOTES.md.
    index('listings_vendor_id_price_idx').on(table.vendorId, table.price),
    index('listings_vendor_id_id_idx').on(table.vendorId, table.id),
    uniqueIndex('listings_vendor_fragrance_size_idx').on(
      table.vendorId,
      table.fragranceId,
      table.sizeMl,
    ),
  ],
);

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
