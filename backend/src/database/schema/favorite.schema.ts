import { users } from './user.schema.js';
import { fragrances } from './fragrance.schema.js';
import {
  pgTable,
  serial,
  integer,
  uuid,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const favorites = pgTable(
  'favorites',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    fragranceId: uuid('fragrance_id')
      .references(() => fragrances.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('favorites_user_id_idx').on(table.userId),
    index('favorites_fragrance_id_idx').on(table.fragranceId),
    uniqueIndex('favorites_user_fragrance_idx').on(
      table.userId,
      table.fragranceId,
    ),
  ],
);

export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
