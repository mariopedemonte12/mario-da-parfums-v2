# vendors

Serves the `vendors` data model (`src/database/schema/vendor.schema.ts`).
Vendors are a plain data entity — no vendor-facing auth, no ownership model.

## Endpoint shape (deliberate, see `specs/vendors-crud.md`)

- `GET /vendors` and `GET /vendors/:id` are public — the module's primary
  purpose is serving vendor data, not gatekeeping it.
- There are **no single-item POST/PATCH/DELETE routes**. All writes go
  through `/vendors/batch` (create/update/delete), even for a single vendor
  (send an array of one). This was a deliberate scope decision, not an
  oversight — don't add single-item mutation routes without revisiting that
  decision with the user first.
- All three batch routes require `JwtAuthGuard` + `RolesGuard(Role.ADMIN)`.
- Batch operations are **partial-success**: each item is applied
  independently and reported as `{ id?, success, error? }`. A duplicate
  name or an unknown id fails only that item, not the whole batch.
