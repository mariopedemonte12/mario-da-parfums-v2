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
  pgEnum,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const seasonEnum = pgEnum('season', [
  'spring',
  'summer',
  'winter',
  'fall',
]);

export const fragrances = pgTable(
  'fragrances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    brand: varchar('brand', { length: 128 }).notNull(),
    concentration: varchar('concentration', { length: 128 }),
    description: text('description'),
    imageUrl: varchar('image_url', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('fragrances_name_idx').on(table.name),
    index('fragrances_brand_idx').on(table.brand),
  ],
);

export type Fragrance = typeof fragrances.$inferSelect;
export type NewFragrance = typeof fragrances.$inferInsert;
