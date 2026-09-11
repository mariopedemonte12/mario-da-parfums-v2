# `fragrances` — notes

Owns: CRUD for the fragrance catalog (`name`, `brand`, `concentration`, `description`, `imageUrl`). Admin-only — every route requires `Role.ADMIN`, including reads. Does not own obtaining `imageUrl` (external webscraper) or verifying it actually serves an image (separate job, outside this backend).

- **Mutations are batch-only** (`POST/PATCH/DELETE /fragrances/batch`), per `module-standards` — there are no single-item create/update/delete endpoints, only `GET /fragrances` (list) and `GET /fragrances/:id` (read). Batch responses are partial-success per item (`{ id, success, error? }`, or `{ success, id?, error? }` for create since the id doesn't exist until insert succeeds).
- **`imageUrl` validation is intentionally split** (agreed with the user, see `specs/fragrances-crud.md`): the DTO (`IsImageUrl`, `src/validators/is-image-url.validator.ts`) only checks that the value is a well-formed http(s) URL with an image extension — no network call. Actually confirming the URL serves a real image is done by a separate job outside this backend; this module does not fetch the URL itself.
- `s3KeyImage` was removed from the schema in favor of `imageUrl` (plain `varchar`, nullable) — the photo now comes from webscraping, not an S3 upload flow.
- No seed data yet: `fragrances` is FK-referenced by `listings`, but `listings`/`vendors` are still Nest CLI scaffolds and no seed runner exists anywhere in the project yet. Add fragrance seeds when `listings` is implemented and actually needs them.
- Swagger (`@nestjs/swagger`) wasn't wired into the project before this module; `main.ts` now sets up `SwaggerModule` at `/docs` as part of meeting the module-standards documentation bar.
