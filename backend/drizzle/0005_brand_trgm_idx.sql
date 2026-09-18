-- Hand-added: Drizzle's schema DSL can't express `USING gin (... gin_trgm_ops)`.
-- Supports the `search` filter of GET /fragrances (specs/text-search-partial.md),
-- which runs `brand ILIKE '%token%'` alongside the existing name trigram index.
-- Plain CREATE INDEX (not CONCURRENTLY) for the same reason as 0004; on a large
-- production table run by hand first:
--   CREATE INDEX CONCURRENTLY "fragrances_brand_trgm_idx" ON "fragrances" USING gin ("brand" gin_trgm_ops);
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fragrances_brand_trgm_idx" ON "fragrances" USING gin ("brand" gin_trgm_ops);
