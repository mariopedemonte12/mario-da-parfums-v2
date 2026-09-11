# Vendors module

## Purpose

Serve the `vendors` database model to the rest of the system: read access for
consumers (e.g. listings/storefront) and admin-managed write access to keep
vendor data current. Vendors are a plain data entity — they are not actors
with credentials, no vendor-facing auth exists or is planned here.

## Data model (existing, `src/database/schema/vendor.schema.ts`)

| field       | type                    | constraints                       |
|-------------|-------------------------|------------------------------------|
| id          | serial                  | PK                                  |
| name        | varchar(128)            | required, unique                    |
| websiteUrl  | varchar(255)            | required, must be a valid URL       |
| createdAt   | timestamp               | server-set, not client-writable     |
| updatedAt   | timestamp               | server-set, not client-writable     |

`listings.vendorId` is a FK to `vendors.id` (see `relations.schema.ts`) —
vendors has no FK dependency of its own, so it seeds before `listings`.

## Endpoints

Only batch endpoints exist for mutations — there are no single-item
POST/PATCH/DELETE routes. Reads keep both a list endpoint and a by-id
endpoint, since "serving vendor data" is the module's primary objective.

| Method | Path             | Auth                     | Purpose                          |
|--------|------------------|---------------------------|-----------------------------------|
| GET    | `/vendors`       | public                    | List vendors, filtered + paginated |
| GET    | `/vendors/:id`   | public                    | Get one vendor by id              |
| POST   | `/vendors/batch` | JWT + `Role.ADMIN`        | Create one or more vendors        |
| PATCH  | `/vendors/batch` | JWT + `Role.ADMIN`        | Update one or more vendors        |
| DELETE | `/vendors/batch` | JWT + `Role.ADMIN`        | Delete one or more vendors        |

A single vendor is created/updated/deleted by sending a batch of one — there
is no dedicated single-item route for those operations.

### GET /vendors — filtering & pagination

Query params, all optional, validated via a `FindVendorsDto`:

- `name` — case-insensitive partial match (`ILIKE %value%`) against `name`.
- `websiteUrl` — case-insensitive partial match against `websiteUrl`.
- `page` — integer, default `1`, min `1`.
- `limit` — integer, default `20`, min `1`, max `100`.

Response is `{ data: ResponseVendorDto[], meta: { page, limit, total, totalPages } }`.
Filtering and pagination are applied in the Drizzle query (`where`/`limit`/`offset`),
never by fetching all rows and filtering in memory.

### POST /vendors/batch — create

Body: `{ items: CreateVendorDto[] }`, `items` non-empty, each validated.

- `name`: required string, 1–128 chars, no leading/trailing whitespace collapsed
  beyond normal validation, must be unique among existing vendors.
- `websiteUrl`: required, valid URL (`@IsUrl`), max 255 chars.

Partial-success semantics: each item is attempted independently. Response is
`{ results: { success: boolean; id?: number; error?: string }[] }`, one entry
per input item, same order. A duplicate `name` (against the DB, or against an
earlier item in the same batch that already succeeded) fails only that item
with a conflict error; it does not fail the whole batch.

### PATCH /vendors/batch — update

Body: `{ items: (UpdateVendorDto & { id: number })[] }`, `items` non-empty.
`UpdateVendorDto` is `PartialType(CreateVendorDto)` — any subset of `name`/
`websiteUrl`. Same partial-success shape as create. An unknown `id` fails
that item (not-found error) without affecting other items. Renaming to a
`name` that collides with another vendor fails that item as a conflict.

### DELETE /vendors/batch — delete

Body: `{ ids: number[] }`, non-empty, each an integer. Same partial-success
shape (`{ id, success, error? }`). An unknown id fails that entry without
affecting the rest. Deletes are hard deletes — the schema has no `deletedAt`
column and soft-delete is not being introduced here. If a vendor is
referenced by an existing listing, deleting it fails that item (FK
violation surfaced as a conflict), rather than cascading.

## Validation error codes

New `ValidationErrorCode` entries for vendor fields (`VENDOR_NAME_REQUIRED`,
`VENDOR_NAME_INVALID_TYPE`, `VENDOR_NAME_TOO_LONG`, `VENDOR_WEBSITE_URL_REQUIRED`,
`VENDOR_WEBSITE_URL_INVALID_FORMAT`, `VENDOR_WEBSITE_URL_TOO_LONG`), following
the existing catalog in `src/shared/enums/validation-error-code.enums.ts`.

## Out of scope

- Vendor-facing authentication (vendors don't log in).
- Vendor logo/image upload.
- Soft delete / archival of vendors.
- Cascading delete of a vendor's listings.
- A generic cross-module seed runner — this module ships its own seed data
  (`src/database/seeds/vendors.seed.ts`) ordered before listings, but wiring
  every module's seeds into one runner is out of scope for this feature.
