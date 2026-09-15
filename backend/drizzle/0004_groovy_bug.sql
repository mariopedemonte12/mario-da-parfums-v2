DROP INDEX "listings_vendor_id_idx";--> statement-breakpoint
CREATE INDEX "listings_vendor_id_price_idx" ON "listings" USING btree ("vendor_id","price");--> statement-breakpoint
CREATE INDEX "listings_vendor_id_id_idx" ON "listings" USING btree ("vendor_id","id");--> statement-breakpoint
-- Hand-added: Drizzle's schema DSL can't express `CREATE EXTENSION` or
-- `USING gin (... gin_trgm_ops)` — see src/database/NOTES.md.
--
-- Plain CREATE INDEX (not CONCURRENTLY) is used here deliberately: this
-- project's migration runner (`drizzle-kit migrate`, invoked by `pnpm
-- db:migrate`) wraps the entire pending batch of migrations in one
-- transaction (drizzle-orm's PgDialect.migrate), and CONCURRENTLY cannot
-- run inside a transaction block at all -- splitting this into its own
-- migration file would not help, since the runner still wraps every
-- pending file together. On a production database already holding
-- significant rows, run the CONCURRENTLY forms below by hand (e.g. via
-- psql, outside drizzle-kit) instead of `pnpm db:migrate`:
--   CREATE INDEX CONCURRENTLY "fragrances_name_trgm_idx" ON "fragrances" USING gin ("name" gin_trgm_ops);
--   CREATE INDEX CONCURRENTLY "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "fragrances_name_trgm_idx" ON "fragrances" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);