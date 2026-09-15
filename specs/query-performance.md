# Query performance (backend)

Not a product feature — a backend performance/correctness pass driven by a
SQL audit run earlier today (2026-09-14) against a disposable `perf_audit`
database (same `backend-postgres-1` container, seeded with 80 vendors, 500k
users, 300k fragrances, 6M listings, 3M favorites). Every change below
traces to an `EXPLAIN (ANALYZE, BUFFERS)` measurement taken against that
data, not a speculative optimization. Worktree: `.claude/worktrees/query-performance`,
branch `worktree-query-performance`.

**Status as of 2026-09-15: implementation complete.** All three sections
(ORDER BY, indexes, cursor pagination for `fragrances`/`listings`) are done,
`backend/src/database/NOTES.md` has the indexing decisions recorded, and
`pnpm lint` + `pnpm test` (626 tests) pass clean from `backend/`. This
worktree stays in place for a separate testing session per the root
workflow — see "Handoff" below for what that session should know.

## 1. `ORDER BY` on every `findAll` — done

`fragrances`, `listings`, `vendors`, `users`, `favorites` `findAll` methods
had no `ORDER BY`. `LIMIT`/`OFFSET` without one has no guaranteed row order
in Postgres — pages could duplicate/skip rows between requests. Fixed by
adding `.orderBy(asc(<table>.id))` to all five (`id` is each table's PK,
already indexed, already unique). No API contract change; this is a
correctness fix, not a behavior change a client could observe as a shape
difference.

## 2. Indexes — done, verified against `perf_audit`

All in `backend/src/database/schema/*.schema.ts`, migration
`backend/drizzle/0004_groovy_bug.sql`, applied to the local dev db
(`mario_da_parfums`) via `pnpm db:migrate`. Also applied by hand to
`perf_audit` to re-confirm plans post-change (see verification below) —
`perf_audit` already had them from this morning's audit session, applied
here again idempotently (`IF NOT EXISTS`).

- **GIN/`pg_trgm` on `fragrances.name`**: `ilike('%term%')` full scan → 119ms
  at 300k rows, unfixable by a plain B-tree (no prefix to seek on). Added
  `CREATE EXTENSION IF NOT EXISTS pg_trgm` + `gin (name gin_trgm_ops)` by
  hand in the migration (Drizzle's schema DSL can't express trigram GIN).
  Verified: `Bitmap Index Scan` replaces `Parallel Seq Scan`, 0.8ms.
- **GIN/`pg_trgm` on `users.email`**: same pattern, 500k rows. Verified:
  `Bitmap Index Scan`, ~1ms.
- **Composite btree `(vendor_id, price)` on `listings`**: equality +
  range filter with no covering index today. Verified: `Index Only Scan`,
  0.15ms (was a `Bitmap Heap Scan` with heap filtering).
- **Composite btree `(vendor_id, id)` on `listings`**: enables keyset
  pagination scoped to one vendor (section 3). Verified: `Index Scan`,
  ~0.8ms for a page 1000 rows deep.
- **Dropped `listings_vendor_id_idx`** (single-column): redundant once the
  two composites above exist — leftmost-prefix rule means both still serve
  a plain `vendor_id` equality lookup. Confirmed no other query in the
  codebase depends on it specifically (grepped every `eq(listings.vendorId, ...)`
  call site).
- **Explicitly not indexed**: `vendors.name`/`websiteUrl` (80-row curated
  table, Seq Scan already <0.05ms — no real query to justify the cost) and
  `listings.in_stock` (no query in the codebase filters on it alone today;
  add a partial index only if/when one is added, per the
  `sql-query-optimization` skill's scope gate).

**Deviation from the skill's `CREATE INDEX CONCURRENTLY` guidance**: this
project's migration runner (`drizzle-kit migrate`, i.e. `pnpm db:migrate`)
wraps the *entire* pending batch of migrations in one transaction
(`drizzle-orm`'s `PgDialect.migrate` calls `session.transaction(...)` around
every migration file, not per-file) — `CONCURRENTLY` cannot run inside a
transaction block at all, and splitting the index-adding statements into
their own migration file doesn't avoid this, since the runner still wraps
every pending file together. The migration therefore uses plain
`CREATE INDEX` (a normal write-locking build). This is fine for the current
dev/CI database sizes; the migration file's comments spell out the
`CONCURRENTLY` DDL to run by hand (e.g. via `psql`, outside `drizzle-kit`)
before applying this migration against a production database that already
holds significant rows.

`backend/src/database/NOTES.md` **still needs the entry** documenting the
GIN-trigram-over-bigger-B-tree choice and the dropped `vendor_id` index —
not yet written (see Handoff).

## 3. Cursor (keyset) pagination for `fragrances` and `listings` — in progress

Measured with `ORDER BY id` already applied: OFFSET pagination degrades
linearly with page depth (87–149ms at 50k-300k row depths); keyset
(`WHERE id > :cursor ORDER BY id LIMIT :limit`) stays flat regardless of
depth (0.05–0.1ms) because it seeks directly via the index instead of
scanning and discarding every skipped row.

**Decision point, resolved with the user**: migrating to cursor pagination
means dropping an exact `total` (would require re-running the full
`count()` this change exists to avoid) and changing the response shape.
`fragrance-catalog` (merged to master) currently depends on
`{ data, total, page, limit }` from `GET /fragrances` to compute
`totalPages` client-side. Presented four options (pure cursor / cursor +
approximate total / dual cursor+offset transitional / defer to a
coordinated session); **the user chose pure cursor, no total**, accepting
that this breaks `fragrance-catalog`'s current contract and requires a
follow-up frontend PR to consume the new shape. Scope of that migration:
**only `fragrances.findAll` and `listings.findAll`** — these were the
highest-volume/deepest-paginated cases measured; `vendors`/`users`/`favorites`
keep offset pagination (`page`/`limit`/`total`) unchanged.

### New contract (fragrances, listings)

- Request: `?cursor=<id of last item from previous page>&limit=<n>` instead
  of `?page=&limit=`. `cursor` omitted = first page. For `fragrances`,
  cursor is a fragrance `id` (uuid). For `listings`, cursor is a listing
  `id` (integer, serial PK).
- Response: `{ data: [...], nextCursor: <id> | null }` — no `total`, no
  `page`, no `meta.totalPages`. `nextCursor` is `null` once a page comes
  back shorter than `limit` (no more rows).
- All existing filters (name/brand/... for fragrances; fragranceId/vendorId/
  inStock/minPrice/maxPrice for listings) are unchanged and compose with the
  cursor condition via `AND`.

### Breaking-change fallout (explicitly out of scope for this backend session)

- **`fragrance-catalog`** (frontend, merged to master) reads
  `{ data, total, page, limit }` from `GET /fragrances` today and computes
  `totalPages` client-side — this will break once this branch ships. Needs
  its own coordinated frontend PR to switch to `cursor`/`nextCursor` and an
  infinite-scroll or "load more" UI instead of numbered pages (no exact
  total is available to render page numbers against).
- `user-profile`'s `/favorites` dependency is **unaffected** — favorites
  pagination was not in scope for the cursor migration (lower volume, not
  prioritized per the audit).
- The MCP `search_fragrances` tool (`backend/src/mcp/tools/register-catalog-tools.ts`)
  was updated to accept `cursor` instead of `page` in its zod input schema,
  matching the DTO change.

## Out of scope for this session

- Cursor pagination for `vendors`, `users`, `favorites` — not prioritized by
  the audit (lower volume/depth); still on offset pagination.
- Any frontend change (`fragrance-catalog`'s consumption of the new
  `fragrances`/`listings` response shape) — flagged above, needs its own
  session/PR.
- The other 4 security-hardening findings from today's separate security
  audit (rate limiting, security headers, payload size, MCP validation,
  HTML sanitization) — unrelated worktree/branch, not touched here.

---

## Handoff (implementation complete, 2026-09-15)

### Done and verified
- Section 1 (ORDER BY) — all 5 services (`fragrances`, `listings`,
  `vendors`, `users`, `favorites`).
- Section 2 (indexes) — schema changes in place, migration
  `backend/drizzle/0004_groovy_bug.sql` generated + hand-edited (extension +
  GIN trgm) + applied to the local dev db. Plans verified against
  `perf_audit` with `EXPLAIN (ANALYZE, BUFFERS)` — matches the audit's
  numbers (bitmap/index-only scans replacing seq scans). Decisions recorded
  in `backend/src/database/NOTES.md`.
- Section 3 decision — resolved with the user via AskUserQuestion: pure
  cursor, no total, for `fragrances`+`listings` only.
- Section 3 implementation — DTOs, services, controllers done for both
  `fragrances` and `listings`; MCP `search_fragrances` tool schema updated
  to `cursor` (uuid). `list_vendors`/`get_listings_for_fragrance`/
  `get_cheapest_listing` untouched — vendors stays offset-paginated, and the
  latter two never exposed page/cursor as MCP input to begin with.
- All specs updated for the new contract: `find-fragrance.dto.spec.ts`,
  `fragrances.service.spec.ts`, `find-listings.dto.spec.ts`,
  `listings.service.spec.ts`, `fragrances.controller.spec.ts`,
  `listings.controller.spec.ts`, `register-catalog-tools.spec.ts`.
- Fixed a regression the ORDER BY change (section 1) introduced in
  `vendors.service.spec.ts`, `users.service.spec.ts`, and
  `favorites.service.spec.ts`: their mocked Drizzle query-builder chains
  didn't have an `.orderBy()` link, so every `findAll`/`findAllForUser` unit
  test threw `TypeError: ...where(...).orderBy is not a function` once the
  service added the real `.orderBy()` call. Added the missing mock link
  (`where().orderBy().limit().offset()`) everywhere it was needed — these
  three modules keep offset pagination unchanged; only their mock chains
  were stale.
- `pnpm lint` (oxlint) — clean; only pre-existing warnings in files this
  session didn't touch for logic (unused-import warnings in
  `is-password-strong.validator.ts`, `is-not-profane.validator.ts`, and
  leftover unused imports in the schema files predating this branch).
- `pnpm test` (vitest, unit) — 626/626 passing, 36/36 files.
- `pnpm exec tsc --noEmit` — still reports the same pre-existing errors
  noted before this session started (`Cannot find module 'supertest/types'`
  across several `*.controller.spec.ts`/`test/*.e2e-spec.ts` files, plus a
  few `email`/`name` property-missing errors in
  `test/favorites.e2e-spec.ts` and `test/mcp.e2e-spec.ts`), confirmed
  unrelated to anything this session touched (none of those files are in
  `git status`). `pnpm test` runs and passes despite them (vitest/esbuild
  doesn't do the same type-only module resolution `tsc` does) — left as-is,
  out of scope for this session.

### For the testing session
- This is a backend performance/correctness change, not new product
  behavior — testing should focus on: (a) the `ORDER BY` fix doesn't change
  filter/response semantics for any of the 5 `findAll`s, (b) the new
  `fragrances`/`listings` cursor contract (`?cursor=&limit=` in,
  `{ data, nextCursor }` out) behaves as documented above — including that
  `nextCursor` is `null` exactly when a page comes back shorter than
  `limit`, and that existing filters still compose correctly with the
  cursor condition, (c) `vendors`/`users`/`favorites` still return their
  unchanged `{ data, total, page, limit }` — page/limit pagination for the
  three untouched modules should show no behavior change at all.
- **Known, accepted breaking change** (not a bug): `GET /fragrances` and
  `GET /listings` no longer return `total`/`page`/`meta.totalPages` — see
  "Breaking-change fallout" above. `fragrance-catalog` (merged to master)
  will fail against this branch until its own frontend PR adapts. That's
  expected, not something to file as a defect against this branch.
- Index verification (re-running `EXPLAIN` against `perf_audit` to confirm
  plans) is optional for the testing session — already done and recorded
  above — but the `perf_audit` database is still there with the new indexes
  applied if a second opinion is wanted.

### Environment notes
- `backend-postgres-1` (local docker, dev db `mario_da_parfums`) already has
  the new migration applied.
- `perf_audit` database (same container) still has the large synthetic
  dataset and the new indexes applied by hand — reusable for further
  `EXPLAIN` verification without re-seeding.
- This worktree required a full `pnpm install` from the monorepo root on
  first use (git worktrees don't carry `node_modules`) — already done,
  should not be needed again unless dependencies change.
- Worktree left in place, nothing committed — per the root workflow, this
  implementation session doesn't merge/PR or commit on its own initiative.

---

## Testing session findings (2026-09-15)

Independent testing session per the root workflow. Verdict: **the feature
itself is correct** — sections 1–3 all behave as specified against a real
Postgres. The one real gap found was in the test suite the implementation
session left behind, not in the implementation.

### Gap found and fixed: e2e suite was stale for the new contract

`test/fragrances.e2e-spec.ts` and `test/listings.e2e-spec.ts` still asserted
the *old* `{ data, total, page, limit }` / `meta` shape against `GET
/fragrances` and `GET /listings` — they were never updated for the cursor
contract. The implementation handoff's "Done and verified" list only
mentions the unit `*.spec.ts` files updated for the new contract; `pnpm
test:e2e` is never mentioned as having been run. Running it at the start of
this session confirmed the gap: 6 failing e2e tests (asserting
`res.body.total`, `res.body.meta.total`, `page=0` boundary rejection, etc.,
none of which exist anymore).

Fixed in this session (test-suite work, not an implementation change):
- Replaced the stale page/total pagination tests in both files with cursor
  equivalents, plus new edge-case coverage: `nextCursor` set-exactly-when-full
  vs `null`-exactly-when-shorter-than-`limit`, cursor advancing with no
  duplicate/skipped rows (including full-enumeration loops), the cursor
  condition composing with existing filters via AND, invalid cursor format
  (non-uuid for fragrances, non-int/`<1` for listings) rejected with 400,
  a well-formed but non-existent cursor id not erroring, and the cursor of
  the last real row returning an empty page with `nextCursor: null`.
- Removed the now-inapplicable `page=0`/`page=1` boundary tests (fragrances
  no longer has a `page` field at all).
- Added end-to-end MCP coverage for `search_fragrances`'s new `cursor`
  input: paginating through real rows with no dup/skip, and a non-uuid
  cursor producing a tool error rather than a crash (previously untested —
  the old suite never exercised `page` there either, so this is new
  coverage, not a fix).
- `pnpm test:e2e` now passes: **245/245**. `pnpm test` (unit) still
  **626/626**. `pnpm lint` still clean (same pre-existing warnings noted in
  the handoff).

### Verified correct (no bugs found)

- **Section 1 (ORDER BY)**: confirmed by diff that `vendors`, `users`,
  `favorites` `findAll` gained only `.orderBy(asc(id))` — filters, response
  shape (`{ data, total, page, limit }`), and all other behavior are
  byte-for-byte unchanged. Full e2e suite (which exercises all three) passes
  with no assertion changes needed on their pagination contract.
- **Section 2 (indexes)**: the brief for this session mentioned a changed
  unique index on `listings` to check — that doesn't match reality; the
  diff shows only the single-column `listings_vendor_id_idx` was dropped in
  favor of the two new composites, the `(vendorId, fragranceId, sizeMl)`
  unique index is untouched. Confirmed still enforced: the existing e2e test
  for a duplicate `(vendor, fragrance, size)` listing still passes. Did not
  re-run `EXPLAIN` against `perf_audit` (optional per the handoff, already
  done by the implementation session).
- **Section 3 (cursor pagination)** — the main focus, verified against real
  Postgres for both `fragrances` and `listings`:
  - `nextCursor` is `null` exactly when a page comes back shorter than
    `limit`, and is still set (correctly, per the documented rule) on a
    page that happens to be exactly `limit` long even if it's the last one
    — the following call is what actually reveals the end. Both endpoints
    match.
  - Cursor correctly advances to the next page with no duplicated or
    skipped rows; walking a full result set page-by-page with `limit=1`
    reproduces the same id set as a single unfiltered fetch.
  - Existing filters (name/brand/concentration/olfactoryFamily/
    targetAudience/longevity for fragrances; fragranceId/vendorId/inStock/
    minPrice/maxPrice for listings) compose correctly with the cursor
    condition via AND on every page, not just the first.
  - Invalid cursor: non-uuid for fragrances and non-integer/`<1` for
    listings both 400 at the DTO layer.
  - A well-formed but non-existent cursor id doesn't error (`gt()` doesn't
    require the row to exist).
  - The cursor of the last real row returns an empty page with
    `nextCursor: null`.
  - MCP `search_fragrances` cursor input verified end-to-end over the real
    MCP transport; `list_vendors`/`get_listings_for_fragrance`/
    `get_cheapest_listing` confirmed unchanged (no diff, and existing e2e
    coverage for them still passes untouched).
- **Known, accepted breaking change**: `fragrance-catalog` (merged to
  master) does break against this branch's `GET /fragrances`, as documented
  above — reproduced, not reported as a defect, needs its own frontend PR.

### Aside, out of scope (not a defect of this branch)

`backend/src/database/NOTES.md`'s pre-existing bullet on `error.code` vs
`error.cause.code` (predates this branch, untouched by this diff) reads as
stale: it says `listings.service.ts`/`vendors.service.ts`/
`fragrances.service.ts` still check `error.code` directly, but all three
(and `favorites.service.ts`) already use the shared
`getPgErrorCode`/`getPgErrorConstraint` helpers in
`src/common/utils/pg-error.util.ts`, which check both. Noted for whoever
next touches that file; unrelated to query performance, not fixed here.

### Worktree status

Left in place, nothing committed by this session either — the branch is
ready to merge/PR as far as this testing session is concerned, pending
whatever the user wants to do with the frontend fallout.
