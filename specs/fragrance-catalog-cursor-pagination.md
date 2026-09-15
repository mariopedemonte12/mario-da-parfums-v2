# fragrance-catalog-cursor-pagination — frontend

## Contexto

Follow-up frontend session flagged as out of scope by
`specs/query-performance.md` ("Breaking-change fallout"): the backend
migrated `GET /fragrances` and `GET /listings` from offset (`page`/`limit`,
`{ data, total, page, limit }`) to keyset/cursor pagination
(`cursor`/`limit`, `{ data, nextCursor }`) — merged to `master` in
`feat(query-performance): ORDER BY, indexes, and cursor pagination`. The
frontend was never updated and is currently broken against the real API:
`fragrance-catalog`'s hooks and `useListingsByFragrance` read `total` /
`meta.totalPages`, fields the backend no longer returns.

This spec covers only the frontend adaptation. No backend change, no new
product behavior beyond the pagination UX forced by the contract change.

## New contract (source of truth: `specs/query-performance.md`)

- **Fragrances** (`GET /fragrances`): request `?cursor=<uuid>&limit=<n>`
  (cursor omitted = first page); response `{ data: Fragrance[], nextCursor:
  string | null }`.
- **Listings** (`GET /listings`): request `?cursor=<id>&limit=<n>` (integer
  id); response `{ data: Listing[], nextCursor: number | null }`.
- `nextCursor` is `null` exactly when a page comes back shorter than
  `limit` — no more rows.
- All existing filters (name/brand/concentration/targetAudience/longevity
  for fragrances; fragranceId/vendorId/inStock/minPrice/maxPrice for
  listings) are unchanged and still compose with the cursor.
- **Out of scope, unchanged**: `vendors`, `users`, `favorites` — still
  offset-paginated (`page`/`limit`/`total`), not touched by this spec.

## Behavior

### Catalog page (`/fragrances`)

- No exact total is available anymore (that's the whole point of the
  backend change — avoiding a full `count()`), so "Página X de Y" is not
  reconstructable. Decided with the user: replace numbered pagination with
  a **"Cargar más" button** appended below the grid.
  - Visible only while `nextCursor !== null` (more rows exist).
  - Hidden once the last page comes back short (no more results) or when
    there are zero results.
  - Clicking it fetches the next page with the current filters + last
    `nextCursor` and **appends** to the already-rendered list (does not
    replace it) — existing cards keep their position/animation.
  - Shows a loading state on the button itself while the next page is
    in flight; existing results stay visible and interactive during that
    fetch (no full-page loading state for "load more", only for the very
    first fetch).
- Changing any filter (name, brand, concentration, target audience,
  longevity) — including the debounced name/brand inputs — resets the
  catalog to a fresh first page: cursor cleared, accumulated results
  replaced (not appended) with the new first page. This matches current
  behavior (`setPage(1)` on every filter change), just expressed as
  "cursor reset" instead of "page reset".
- The header's numeric badge next to "Todos los perfumes" (previously the
  server-reported `total`) is **removed** — there is no exact total to
  show, and showing "results loaded so far" in that slot would read as a
  total and mislead. If a running/approximate count becomes a real product
  need later, that's a separate decision, not assumed here.
- Race safety: if a filter changes while a "Cargar más" fetch for the
  previous filter set is still in flight, the stale response must not be
  appended once it resolves (must not corrupt the freshly-reset list for
  the new filters).

### Fragrance detail page (`/fragrances/[id]`) — listings/prices table

- `useListingsByFragrance` fetches **all** listings for one fragrance (no
  "load more" UI here — the price table wants the full set to sort/render
  at once, same as before). Internally this now means following
  `nextCursor` in a loop (`while (nextCursor)`) instead of iterating
  `page` up to `meta.totalPages`, which no longer exists. Externally
  nothing changes — same `{ listings, loading, error }` return shape,
  same full-drain behavior.

## Explicitly out of scope

- Any backend change — already shipped, this session only adapts the
  frontend contract.
- `vendors`/`users`/`favorites` pagination — untouched, still offset-based.
- An approximate/running total for the catalog header — dropped, not
  replaced with an estimate.
- Infinite scroll — user chose an explicit "Cargar más" button over
  auto-loading on scroll.

## Handoff for testing

This implementation session does not test its own work (root
`CLAUDE.md`). For the separate testing session:

- Verify `GET /fragrances` and `GET /listings` are called with `cursor`
  (never `page`) and that the catalog/detail pages render correctly
  against the real cursor-based backend (not a mock still returning
  `total`).
- "Cargar más" button: appears/disappears correctly around the
  `nextCursor === null` boundary (including a result set that's an exact
  multiple of `limit` producing an empty-but-`nextCursor: null` page vs.
  one that isn't), appends without duplicating or losing already-rendered
  cards, disabled/loading state while a fetch is in flight.
- Filter change while a "Cargar más" fetch is in flight: confirm the
  stale response doesn't land on top of the new filtered list (race
  condition called out above).
- `useListingsByFragrance` still returns the complete listing set for
  fragrances with more than one page's worth of listings (>20 by default
  `limit`), matching pre-change behavior.
