# Listings module

## Purpose

Serve the `listings` data model — the central entity of the platform (per
`platform-spec.md` §3/§4.2): the current price of one fragrance, in one size,
at one vendor. Read access is public (comparing prices needs no account);
write access is admin-only. This module is a plain CRUD surface over the
table — it does not implement the daily/weekly scraping jobs (those write
directly to the DB per `platform-spec.md` §2) nor any "cheapest vendor" /
comparison endpoint; that is explicitly out of scope here (see below).

## Data model (existing, `src/database/schema/listing.schema.ts`)

| field        | type      | constraints                                          |
|--------------|-----------|-------------------------------------------------------|
| id           | serial    | PK                                                     |
| fragranceId  | uuid      | FK → `fragrances.id`, `onDelete: cascade`, required   |
| vendorId     | integer   | FK → `vendors.id`, required                            |
| sizeMl       | integer   | required                                               |
| price        | integer   | required (CLP, entero)                                 |
| url          | varchar(500) | required                                           |
| inStock      | boolean   | default `true`                                         |
| scrapedAt    | timestamp | server-set, defaults `now()`                           |

Unique index `(vendorId, fragranceId, sizeMl)` — a given vendor sells a given
fragrance in a given size at most once (see `platform-spec.md` §4.2). No
`updatedAt` column: `scrapedAt` doubles as "last reviewed at", bumped on every
write (including a manual admin edit through this module, not only the daily
job) — there is no separate "last edited by admin" timestamp, since keeping
two similar timestamps for a module this small isn't worth it.

## Endpoints

Same shape as `vendors`/`fragrances`: only batch endpoints exist for
mutations, reads keep both a list and a by-id endpoint.

| Method | Path              | Auth                | Purpose                          |
|--------|-------------------|----------------------|-----------------------------------|
| GET    | `/listings`       | public              | List listings, filtered + paginated |
| GET    | `/listings/:id`   | public              | Get one listing by id (int)       |
| POST   | `/listings/batch` | JWT + `Role.ADMIN`  | Create one or more listings        |
| PATCH  | `/listings/batch` | JWT + `Role.ADMIN`  | Update one or more listings        |
| DELETE | `/listings/batch` | JWT + `Role.ADMIN`  | Delete one or more listings        |

No single-item POST/PATCH/DELETE routes — a single listing is created/
updated/deleted by sending a batch of one, same deliberate decision as
`vendors`/`fragrances`.

### GET /listings — filtering & pagination

Query params, all optional, validated via `FindListingsDto`:

- `fragranceId` — exact match (uuid).
- `vendorId` — exact match (int).
- `inStock` — exact match (boolean).
- `minPrice` / `maxPrice` — inclusive range on `price` (ints); price
  comparison is the core of the product, so a range filter here is a plain
  part of the entity's own fields, not a special comparison feature.
- `page` — integer, default `1`, min `1`.
- `limit` — integer, default `20`, min `1`, max `100`.

Response: `{ data: ResponseListingDto[], meta: { page, limit, total, totalPages } }`.
Filters/pagination are applied server-side in the Drizzle query, never by
fetching everything and filtering in memory.

### POST /listings/batch — create

Body: `{ items: CreateListingDto[] }`, non-empty.

- `fragranceId`: required, uuid v4.
- `vendorId`: required, positive int.
- `sizeMl`: required, positive int.
- `price`: required, positive int (CLP).
- `url`: required, valid http(s) URL, max 500 chars.
- `inStock`: optional boolean, defaults to the column default (`true`) when
  omitted.

Partial-success: `{ results: { id?, success, error? }[] }`, one entry per
input item, same order.

- A duplicate `(vendorId, fragranceId, sizeMl)` (DB unique-constraint
  violation) fails only that item with a conflict-style message — it does
  not abort the batch (same partial-success rule as `fragrances`/`vendors`;
  no `409` is ever raised for a batch call, only per-item `success: false`).
- An unknown `fragranceId`/`vendorId` (FK violation) fails only that item
  ("Fragrance or vendor not found").

### PATCH /listings/batch — update

Body: `{ items: (UpdateListingDto & { id: number })[] }`, non-empty.
`UpdateListingDto` is `PartialType(CreateListingDto)`. Same partial-success
shape. Updating any field bumps `scrapedAt` to `now()` (see "no `updatedAt`"
above). An unknown `id` fails that item (not-found); moving a listing to a
`(vendorId, fragranceId, sizeMl)` that collides with another existing row
fails that item as a conflict; repointing to an unknown `fragranceId`/
`vendorId` fails that item as a not-found/FK error. Repointing
`fragranceId`/`vendorId` at all is technically allowed (no field is
special-cased as immutable) — this mirrors `fragrances`' open question being
resolved permissively, since nothing in this phase requires locking it down.

### DELETE /listings/batch — delete

Body: `{ ids: number[] }`, non-empty. Same partial-success shape. Hard
deletes only (no `deletedAt` column, no soft delete). An unknown id fails
that entry without affecting the rest. Nothing has an FK onto `listings`, so
a delete cannot fail on a foreign-key violation in practice, but the write
path still reports any unexpected DB error per-item rather than throwing,
for consistency with `vendors`/`fragrances`.

## Validation error codes

New `ValidationErrorCode` entries, following the existing per-field catalog:
`LISTING_FRAGRANCE_ID_REQUIRED`, `LISTING_FRAGRANCE_ID_INVALID_FORMAT`,
`LISTING_VENDOR_ID_REQUIRED`, `LISTING_VENDOR_ID_INVALID_TYPE`,
`LISTING_SIZE_ML_REQUIRED`, `LISTING_SIZE_ML_INVALID_TYPE`,
`LISTING_PRICE_REQUIRED`, `LISTING_PRICE_INVALID_TYPE`,
`LISTING_URL_REQUIRED`, `LISTING_URL_INVALID_FORMAT`,
`LISTING_URL_TOO_LONG`, `LISTING_IN_STOCK_INVALID_TYPE`. `url` reuses the
existing `IsUrlField` wrapper (same one `vendors.websiteUrl` uses).

## Errors

Follows `docs/error-handling.md`: DTO validation → `400` with
`FieldError[]`. `GET /listings/:id` not found → `NotFoundException` (404).
No token on a batch route → `UnauthorizedException` (401). Non-admin caller
on a batch route → `ForbiddenException` (403), via `RolesGuard`. As with
`fragrances`/`vendors`, no batch mutation ever raises a `409` for the whole
request — duplicate/FK/not-found failures on individual items are reported
inside the `200`/`201` partial-success body.

## Out of scope

- The daily/weekly scraping workers themselves (separate standalone
  processes per `platform-spec.md` §2/§4, writing directly to the DB — not
  part of this backend module).
- Any "list listings for a fragrance with best price" / "cheapest available
  vendor" / comparison endpoint (`platform-spec.md` §5.3) — that is
  consumer-facing read functionality layered on top of this plain CRUD and
  belongs to its own feature spec when built, not to this module.
- Price history / trend — `platform-spec.md` explicitly has no history table;
  `scrapedAt` + `price` are overwritten in place.
- Seed data — nothing has an FK onto `listings`, so per `module-standards`
  ("skip seeds for a module when nothing depends on its data") this module
  does not ship its own seed file. (`vendors.seed.ts` and any future
  fragrance seed exist so *this* module's own tests/dev data can reference
  real `vendorId`/`fragranceId` values, not the other way around.)
- Soft delete / archival of listings.
