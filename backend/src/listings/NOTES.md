# `listings` — notes

Owns: CRUD for the `listings` table — the current price of one fragrance, in
one size, at one vendor (the platform's central entity, see
`platform-spec.md` §3/§4.2). Public reads, admin-only batch writes. Does not
own the scraping jobs that populate/refresh listings (separate standalone
processes writing directly to the DB) nor any price-comparison/"cheapest
vendor" endpoint — those are out of scope, see `specs/listings-crud.md`.

- **Mutations are batch-only** (`POST/PATCH/DELETE /listings/batch`), same
  deliberate decision as `fragrances`/`vendors` — no single-item
  create/update/delete routes. `GET /listings` and `GET /listings/:id` are
  public (comparing prices needs no account).
- **No `updatedAt` column** — `scrapedAt` doubles as "last reviewed at" and is
  bumped on every write, including a manual admin edit through this module
  (not only the daily scraping job). This was a deliberate choice to avoid
  two near-duplicate timestamps on a table this small.
- **Unique constraint** `(vendorId, fragranceId, sizeMl)` — a duplicate on
  create/update surfaces as a per-item batch failure (Postgres `23505`), not
  a whole-batch `409`, same partial-success rule as `fragrances`/`vendors`.
  An unknown `fragranceId`/`vendorId` surfaces the same way via the FK
  violation (`23503`).
- `listings.id` is `serial` (like `vendors`, unlike `fragrances`' `uuid`), so
  batch item ids and `:id` params use `ParseIntPipe`/`IsInt`, not UUID
  validation.
- No seed data: nothing has an FK onto `listings`, so per `module-standards`
  this module doesn't ship its own seed file (it consumes `vendors`/
  `fragrances` seed data instead, once the latter exists).
