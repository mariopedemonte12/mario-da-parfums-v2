import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';

export const vendors = pgTable('vendors', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 128 }).notNull().unique(),
  websiteUrl: varchar('website_url', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
