# Favorites module

## Purpose

Serve the `favorites` join model (`User` N:N `Fragrance`, per `platform-spec.md`
§3/§5.4): let an authenticated user mark/unmark a fragrance as favorite, list
their own favorites, and let any consumer ask "how many users have favorited
this fragrance" (the popularity signal). This is the minimum scope agreed with
the user for this feature — see "Explicitly out of scope" below for what
`platform-spec.md` §5.4 mentions that is deliberately **not** built here.

## Data model (existing, `src/database/schema/favorite.schema.ts`)

| field        | type      | constraints                                         |
|--------------|-----------|------------------------------------------------------|
| id           | serial    | PK                                                     |
| userId       | integer   | FK → `users.id`, `onDelete: cascade`, required         |
| fragranceId  | uuid      | FK → `fragrances.id`, `onDelete: cascade`, required    |
| createdAt    | timestamp | server-set, not client-writable                        |

Unique index on `(userId, fragranceId)` — a user can't favorite the same
fragrance twice; violating it is a `ConflictException`, not a raw DB error
(same pattern as `listings`' unique index, per `database/NOTES.md`).

No FK in the schema references `favorites`, so this module needs no seed data
(per the module-standards skill: "skip seeds when nothing depends on the
module's data").

## Auth

Every endpoint requires a valid JWT (`JwtAuthGuard`) — there is no public
endpoint. No role restriction (`RolesGuard`/`@Roles`) on any route: per
`platform-spec.md` §5.4, favorites exist for any authenticated `User`
regardless of role, an `ADMIN` favorites fragrances the same way a `USER`
does. The acting user is always the JWT's `sub` claim — there is no route or
body field that lets a caller mark/unmark/list favorites on another user's
behalf.

## Endpoints

Following the repo's established batch-only mutation convention (see
`vendors-crud.md`, and the module-standards skill's "do not keep the
single-item endpoints"): a single mark/unmark is a batch of one. There is no
PATCH batch — a favorite has no mutable fields, it only exists or doesn't, so
"update" has no meaning here.

| Method | Path                                    | Auth | Purpose                                   |
|--------|-----------------------------------------|------|--------------------------------------------|
| GET    | `/favorites`                            | JWT  | List the caller's favorite fragrances, paginated |
| GET    | `/favorites/fragrances/:fragranceId/count` | JWT | Get how many users favorited a fragrance |
| POST   | `/favorites/batch`                      | JWT  | Mark one or more fragrances as favorite    |
| DELETE | `/favorites/batch`                      | JWT  | Unmark one or more fragrances              |

### GET /favorites — list caller's favorites

Query: `page` (default 1, min 1), `limit` (default 20, min 1, max 100) — same
shape as `FindFragranceDto`. Scoped to `request.user.sub`; there is no filter
to see another user's favorites.

Response includes the favorited fragrance's own data (not just its id) — per
`platform-spec.md` §5.4 "no ser solo una lista de IDs" — but **not** price/
listing data (see out of scope). Shape:
`{ data: { id, fragrance: ResponseFragranceDto, createdAt }[], total, page, limit }`.

### GET /favorites/fragrances/:fragranceId/count — popularity

`:fragranceId` is a UUID (`ParseUUIDPipe`). 404s if the fragrance itself
doesn't exist (delegates existence-check to `FragrancesService`, module
boundary respected — no direct query into another module's table for that
check). Response: `{ fragranceId, favoritesCount }`.

This intentionally does **not** implement a "top N most popular fragrances"
ranked endpoint — the user's own framing of "most popular" for this task is
exactly "given a fragrance, how many users favorited it," which this endpoint
answers directly; a ranked/sorted listing is not part of the ask.

### POST /favorites/batch — mark

Body: `{ fragranceIds: string[] }` (non-empty, each a UUID). Not
`{ items: CreateFavoriteDto[] }` — since the only field a favorite is created
from is `fragranceId` itself, an array of one-field objects would be pure
noise over a flat array of ids (same reasoning `DeleteFragranceBatchDto`
already applies to its `ids: string[]`).

Partial-success per item, response `CreateBatchResultDto[]` in input order:
`{ fragranceId, success, id?, error? }`. Failure modes per item:
- fragrance id doesn't exist → not-found error for that item.
- already favorited by the caller → conflict error for that item (does not
  fail the rest of the batch).

### DELETE /favorites/batch — unmark

Body: `{ fragranceIds: string[] }` (non-empty, each a UUID). Partial-success,
response `BatchResultDto[]`: `{ fragranceId, success, error? }`. An id the
caller never favorited fails only that item (not-found), same partial-success
shape as every other batch endpoint in the repo.

## Validation error codes

New `ValidationErrorCode` entries: `FRAGRANCE_ID_REQUIRED`,
`FRAGRANCE_ID_INVALID_FORMAT` (not a UUID), `FRAGRANCE_IDS_REQUIRED` (empty
batch array) — following the existing catalog.

## Explicitly out of scope (this iteration)

Agreed with the user: the module's minimum functionality is retrieving a
user's favorite fragrances and the per-fragrance favorite count. Nothing
else. In particular, deliberately **not** built here even though
`platform-spec.md` §5.4 mentions it:

- Combining the favorites list with price/listing data ("ver mis favoritos
  ya muestre dónde comprarlos más barato"). `GET /favorites` returns
  fragrance data only; joining in `listings`/vendor price comparison is
  future work, not this feature.
- A ranked "most popular fragrances" list endpoint — only the per-fragrance
  count is implemented (see above).
- Chatbot/MCP access to favorites (already out of scope per
  `platform-spec.md` §9, read-only catalog/price data only).
- Sharing a favorites list between users, or any social/profile layer beyond
  `USER`/`ADMIN`.
