---
name: sql-query-optimization
description: "Use when adding or reviewing a list/search/report endpoint against Drizzle+Postgres, or when asked to speed up a slow query, keeping in mind the database can scale to millions of rows. Covers finding the real query workload, reading EXPLAIN plans, choosing index types (B-tree, partial, covering, GIN/pg_trgm, GIN/tsvector, BRIN, pgvector HNSW/IVFFlat), and query rewrites (keyset pagination, avoiding function-wrapped predicates, EXISTS vs IN). Triggers: \"optimize this query\", \"slow query\", \"add an index\", \"full table scan\", \"optimizar consulta\", \"consulta lenta\", \"agregar indice\", \"full scan\", \"escala a millones\", \"approximate index\", \"indice aproximado\"."
---

# SQL query optimization

Applies whenever a backend change touches a list/search/filter/report query, or the request is explicitly to make a query faster at scale. Companion to [`backend/CLAUDE.md`](../../../CLAUDE.md) (Drizzle ORM, Postgres, "never hand-write SQL when a query builder call does the job") and `module-standards` (server-side filtering/pagination baseline). This skill is about making those queries not fall over once the table has millions of rows, not about their existence — `module-standards` already requires filtering/pagination to exist.

## Scope gate — justify every index by a real query

Don't index speculatively. An index this skill recommends must trace back to an actual `findAll`/search/join in a service, or one the user is about to add — never "this column looks like it'll be queried someday." Every index has a cost too: slower writes, more storage, more WAL. A table that will stay small (lookup/enum-like tables, e.g. `vendors`, `roleEnum`) doesn't need this treatment even if it has filters today.

## Step 1 — Find the real workload, don't guess

Enumerate candidate hot queries from the actual code, not intuition: every `findAll` in a `<module>.service.ts` plus its `Find<X>Dto` filters, every `JOIN`, every `ORDER BY`, and any per-request FK lookup (e.g. listings by fragrance on a detail page, favorites by user). As of this writing, the known hot patterns in this backend are:

- `fragrances.findAll` — `ilike` leading-wildcard on `name`, equality on `brand`/`concentration`/`olfactoryFamily`/`targetAudience`/`longevity`.
- `listings.findAll` — equality on `fragranceId`/`vendorId`/`inStock`, range (`gte`/`lte`) on `price` (currently unindexed).
- `vendors.findAll` / `users.findAll` — `ilike` leading-wildcard on `name`/`email`/`websiteUrl`.
- `favorites.findAllForUser` — inner join `favorites` → `fragrances`, filtered by `userId`.

Re-derive this list for whatever module you're actually touching — treat the above as the standing baseline to recheck, not a fixed inventory.

## Step 2 — Baseline with EXPLAIN, at realistic scale

- Application code never hand-writes SQL, but `EXPLAIN` needs raw SQL — run it through Drizzle's `sql` tag in a one-off scratch script (`db.execute(sql\`EXPLAIN (ANALYZE, BUFFERS) ...\`)`), not inside a service.
- Seed/dev data here is a handful of rows per table. Postgres will correctly choose a `Seq Scan` on that — it's the right call at that size, not evidence an index is missing or working. Never judge a plan against seed-sized data. Before trusting a plan, generate a synthetic dataset at the target order of magnitude (`generate_series` inserts into a throwaway copy of the table or a disposable local DB) and re-run there.
- Read the plan for the actual failure signatures at scale: `Seq Scan` on a filtered/joined table, `Sort` spilling to `external merge Disk`, a `Nested Loop` whose actual row count wildly exceeds the estimate, a large `Rows Removed by Filter` relative to rows returned.

## Step 3 — Pick the index type (decision tree)

- **B-tree (default)**: one per genuinely selective equality/range predicate not already covered by another index.
- **Composite, ordered correctly**: equality columns first (order among themselves doesn't matter), then at most one range/sort column last — match `ORDER BY` where possible so Postgres skips a separate sort. E.g. `listings` filtered by `vendorId` (eq) + `price` (range) wants `(vendor_id, price)`, not `(price, vendor_id)`.
- **Partial index**: the app constantly filters on one fixed, skewed value (`WHERE in_stock = true`). Index only that subset — smaller and cheaper to maintain than indexing every row.
- **Covering / index-only scan**: append frequently-selected-but-not-filtered columns via Drizzle's `.on(...).include(...)` so Postgres answers straight from the index, no heap fetch. Good for narrow, hot list endpoints (e.g. a fragrance-detail listings widget selecting only `price`/`url`/`inStock`).
- **GIN + `pg_trgm`**: any `ilike('%term%')` leading-wildcard search — a plain B-tree cannot serve this at all, only trailing-wildcard (`term%`) can. Every `ilike` search in this codebase today (`fragrances.name`, `vendors.name`, `vendors.websiteUrl`, `users.name`, `users.email`) is a full scan waiting to happen once those tables grow past a few thousand rows; a trigram GIN index (`CREATE EXTENSION pg_trgm` + `USING gin (col gin_trgm_ops)`) is the actual fix, not a bigger B-tree.
- **GIN + `tsvector`**: real multi-field, ranked full-text search (as opposed to substring containment) — a generated `tsvector` column combining name/description/brand with a GIN index, once search needs relevance ranking rather than just "contains."
- **BRIN — the native approximate index**: tiny footprint (KBs vs MBs/GBs for an equivalent B-tree) by indexing block ranges instead of rows, at the cost of exact per-row lookup. Fits a huge, append-mostly column whose values roughly track physical insertion order — `listings.scrapedAt`, `createdAt` on any table that's mostly append. Wrong for a column with random access patterns (it degrades to scanning most blocks anyway).
- **pgvector HNSW/IVFFlat — approximate nearest neighbor**: for true semantic search once fragrance embeddings exist as vector columns (today's "semantic search" in `home-search` is `ilike`, not embeddings — this only applies once that changes). Not installed in this project yet — introduce it only when a real vector column is added, never preemptively. Requires a hand-added `CREATE EXTENSION IF NOT EXISTS vector;` migration (Drizzle's schema DSL doesn't emit extension DDL), a `vector(n)` column, and a choice between HNSW (faster queries, more memory/build time) and IVFFlat (cheaper to build, needs a representative `ANALYZE` sample to size lists well). Always benchmark recall@k against the feature's actual tolerance before shipping — approximate here trades correctness for speed, and that tradeoff needs to be a conscious, measured one.

## Step 4 — Query rewrites that don't need a new index

- **OFFSET pagination degrades with page depth** — Postgres still scans and discards every skipped row. Every `findAll` in this backend (`fragrances`, `listings`, `vendors`, `users`, `favorites`) uses `.limit().offset((page-1)*limit)` today, which is fine at low page depth on today's table sizes. Flag it as the first thing to replace with **keyset/cursor pagination** (`WHERE id > :lastSeenId ORDER BY id LIMIT :limit`, on an already-indexed column) once deep pages actually get requested or a table crosses roughly six-to-seven figures of rows.
- **The paired `count()` next to almost every `findAll`** fully scans the filtered set just to report a total. Cheap today; on a filtered, million-row table it roughly doubles the cost of every list request. When an exact total isn't a real product requirement (infinite scroll, "load more"), drop it. When it is, consider capping it (`count(*) FROM (... LIMIT 10000) t`) or an approximate unfiltered total from `pg_class.reltuples`.
- **Don't wrap an indexed column in a function/cast inside `WHERE`** (`LOWER(email) = ...`) — it defeats a plain B-tree. Normalize at write time instead, or add a matching expression index if the transform is unavoidable at query time.
- **Avoid `OR` across different columns** in one predicate — the planner often can't use either column's index well. Rewrite as a `UNION` of two indexed queries, or fold into one GIN/tsvector predicate when it's really a multi-field search.
- **Prefer `EXISTS` over `IN (subquery)`** for semi-joins against a large driving table.

## Step 5 — Implement the Drizzle way

- Index definitions live in the table's schema file (`src/database/schema/<table>.schema.ts`), in the third-argument callback array next to any existing indexes — never as hand-written SQL in application code, per `backend/CLAUDE.md`.
- Anything Drizzle's schema DSL can't express directly (extensions, `pg_trgm`/`tsvector`/expression indexes, partial-index predicates it doesn't support) goes into the migration by hand: run `pnpm drizzle-kit generate` first for whatever the DSL *does* cover, then edit the generated `.sql` to add `CREATE EXTENSION IF NOT EXISTS ...` / `CREATE INDEX ... USING gin (... gin_trgm_ops)` alongside it.
- On a table already at meaningful size, add the index with `CREATE INDEX CONCURRENTLY` (run outside a transaction) so the migration doesn't take a write-blocking lock — the default generated migration path doesn't do this for you.
- Re-run the Step 2 `EXPLAIN` after adding the index, against the same synthetic large dataset, and confirm the plan actually changed (`Index Scan` / `Index Only Scan` / `Bitmap Heap Scan` replacing `Seq Scan`). An index Postgres doesn't choose to use isn't a fix.

## Step 6 — Document the non-obvious decision

Per the root convention, an index/schema choice that isn't self-evident from the column name belongs in `src/database/NOTES.md` — *why* BRIN was chosen over B-tree on `scrapedAt`, why a partial index only covers `in_stock = true`, why pgvector was introduced and with which index type and parameters. Don't create or touch the file for a plain equality-column B-tree — that's already obvious from the schema.

## Guardrails

- Every index traces to a query found in Step 1 — never a hypothetical one.
- Never judge from a plan run against the current tiny seed/dev dataset — always validate against data sized like the real millions-of-rows target before and after.
- Approximate indexes (BRIN, HNSW/IVFFlat) trade exactness for size/speed. State that tradeoff explicitly in the `NOTES.md` entry; reach for them only when the access pattern actually fits (append-ordered huge column, or real vector similarity search) — never as a default over B-tree.
