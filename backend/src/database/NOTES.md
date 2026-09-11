# `database` — notes

- **`DatabaseModule` is `@Global()`** with two chained providers: `PG_POOL` (internal, the raw `pg` Pool) and `DRIZZLE` (exported, the Drizzle-wrapped connection). `PG_POOL` exists as its own provider — rather than being created inline inside the `DRIZZLE` factory — specifically so it can be injected into the module and closed in `onModuleDestroy` (clean shutdown, no dangling Postgres connections in tests/redeploys).
- **`schema/index.ts` is the single source of truth** passed to `drizzle(pool, { schema })`, which is what enables Drizzle's query API (`db.query.fragrances.findMany({ with: { listings: true } })`) — and the same file `drizzle.config.ts` points at for migrations. If a new table/relation isn't re-exported from `schema/index.ts`, Drizzle doesn't know about it even though the table exists physically.
- **`drizzle.config.ts`** runs outside Nest's bootstrap (via the `drizzle-kit` CLI), so it loads `.env` manually (`import 'dotenv/config'`) instead of relying on `ConfigModule`.

## Schema quirks

- **`fragrances.id` is `uuid` (`defaultRandom()`)**; `users.id`, `vendors.id`, `listings.id` are `serial` (autoincrement). Any controller/service converting a route `:id` param with `+id` will get `NaN` against a fragrance id — watch for this when implementing `fragrances`.
- **`listings.fragranceId` column is physically named `"perfume_id"`**, not `"fragrance_id"` — the TS field and the Postgres column name don't match. Relevant when writing raw SQL or reading the schema directly.
- **`vendors.updatedAt` column is physically named `"updates_at"`** (with an "s"), inconsistent with every other table's `updated_at` — pre-existing naming inconsistency, not a typo to "fix" without a migration.
- **`listings` unique index `(vendorId, fragranceId, sizeMl)`**: a vendor can't have two listings for the same fragrance at the same size. The scraper is expected to upsert on this combination rather than insert duplicates — a violation here should become a `ConflictException` from the service layer, not a raw DB error.
- `users` has no FK relationships to `fragrances`/`vendors`/`listings` — it's intentionally decoupled from the catalog/listing graph.
