import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const fragrances = pgTable(
  'fragrances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    brand: varchar('brand', { length: 128 }).notNull(),
    concentration: varchar('concentration', { length: 128 }),
    description: text('description'),
    imageUrl: varchar('image_url', { length: 500 }),
    // olfactoryFamily/targetAudience/longevity: sourced from the Kaggle
    // dataset's category/target_audience/longevity columns by
    // similarityServer (see specs/fragrance-notes-enrichment.md) —
    // free-form varchar, not an enum, matching how `concentration` already
    // holds a small-but-open vocabulary rather than a closed one.
    olfactoryFamily: varchar('olfactory_family', { length: 128 }),
    targetAudience: varchar('target_audience', { length: 32 }),
    longevity: varchar('longevity', { length: 32 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('fragrances_name_brand_idx').on(table.name, table.brand),
    index('fragrances_brand_idx').on(table.brand),
    index('fragrances_olfactory_family_idx').on(table.olfactoryFamily),
    index('fragrances_longevity_idx').on(table.longevity),
    // fragrances_name_trgm_idx: GIN/pg_trgm added by hand in the migration
    // SQL (Drizzle's schema DSL can't express `USING gin (... gin_trgm_ops)`
    // or `CREATE EXTENSION`) — see src/database/NOTES.md.
  ],
);

export type Fragrance = typeof fragrances.$inferSelect;
export type NewFragrance = typeof fragrances.$inferInsert;
