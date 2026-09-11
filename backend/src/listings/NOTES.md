# `listings` — notes

Module is still Nest CLI scaffold (`nest g resource listings`) — controller/service/DTOs/entity are stubs, nothing touches the database yet.

- `listings.id` is `serial`, so (unlike `fragrances`) the controller's `+id` conversion is actually correct against the schema.
- **`CreateListingDto` is empty today**; when implemented it should cover: `fragranceId` (uuid FK), `vendorId` (FK), `sizeMl`, `price`, `url`, `inStock` (optional, defaults `true`). `id`/`scrapedAt` are DB-generated.
  - FK existence checks (`fragranceId`/`vendorId`) belong in the service (`NotFoundException`/`ConflictException`), not the DTO.
  - The table has a unique index `(vendorId, fragranceId, sizeMl)` — a duplicate listing for the same vendor/fragrance/size should surface as `ConflictException` from the service, not a raw DB error (see `src/database/NOTES.md`).
- `UpdateListingDto` derives via `PartialType`; worth revisiting whether `fragranceId`/`vendorId` should even be updatable (re-pointing a listing to a different fragrance/vendor is a different operation than correcting price/stock) once the DTO has real fields.
- No guards applied yet; will likely need an ownership/vendor-role guard once real auth is wired in.
