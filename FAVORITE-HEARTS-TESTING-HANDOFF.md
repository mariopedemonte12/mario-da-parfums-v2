# Testing handoff — favorite-hearts

Session: independent testing session (root `CLAUDE.md` implementation/testing
split), worktree `.claude/worktrees/favorite-hearts`, branch
`worktree-favorite-hearts`. Spec: `specs/favorite-hearts.md`. Implementation
handoff: `FAVORITE-HEARTS-IMPLEMENTATION-HANDOFF.md`.

## Status: tested, one small bug found and fixed

Frontend has no test tooling configured yet (per the `testing` skill's stack
notes), so this was a manual/black-box pass driven with Playwright against
real running services (backend `:3010`, frontend `:3011`, perfumeCatalogImporter
`:8001`, real Postgres via `docker-compose`) — not a written automated suite.

All scenarios from the spec and the implementation handoff's "not yet
verified" list were driven and passed:

1. **Semantic search hearts** (`/`, needs `perfumeCatalogImporter` running —
   the one thing the implementation session flagged as unverified): protagonist
   heart and all 3 secondary-match hearts render, toggle correctly, and clicking
   a secondary-match heart does **not** trigger the surrounding `Link`'s
   navigation (URL stayed on `/` in both cases).
2. **Not logged in**: clicking any heart on `/fragrances` while logged out
   redirects to `/login`; confirmed via network listener that **zero**
   `/favorites` requests fire.
3. **Optimistic revert on failure**: intercepted `POST /favorites/batch` to
   force a 500. Heart flips to filled + becomes `disabled` immediately
   (optimistic), then reverts to unfilled + re-enables once the failed
   request resolves. `aria-label`/`aria-pressed` match the pre-click state
   exactly after revert.
4. **Pending guard**: with the batch request artificially delayed, the
   button carries a real `disabled` attribute while pending, and a forced
   second click on the same (still-pending) button does **not** fire a
   second `POST /favorites/batch` — confirmed via request-count assertion,
   not just UI appearance.
5. **Catalog + detail + profile**: heart toggles instantly (optimistic),
   correct `POST`/`DELETE /favorites/batch` payload (`{fragranceIds:[id]}`),
   no navigation from the card's own `Link` on click. `/profile`'s
   `FavoritesGrid` removes a card live (no reload) the instant its heart is
   unfavorited — confirmed by count before/after (4 → 3).
6. **>100 favorites scope cut**: confirmed by reading
   `favorites/api/favorites.api.ts` — `listFavoriteIds()` calls
   `GET /favorites?page=1&limit=100` once, no pagination loop. Matches the
   spec's explicit out-of-scope note; not an oversight.

## Bugs found in favorite-hearts itself

- **`FavoriteHeart`'s button had no pointer cursor on hover** — Tailwind v4
  doesn't default `<button>` to `cursor:pointer` the way a browser's own
  user-agent stylesheet might, so the heart looked non-interactive. Fixed
  by adding `cursor-pointer` (and `disabled:cursor-not-allowed`, to match
  the existing `disabled:opacity-60`) to `FavoriteHeart.tsx`'s button
  classes. Re-verified via `getComputedStyle(...).cursor === "pointer"` in
  a real browser.

## Adjacent issue found and fixed (NOT part of favorite-hearts scope, fixed at the user's explicit request)

- **`perfumeCatalogImporter`'s local venv had corrupted package metadata**
  (`pip show` returned `Version: None` for `typing_extensions`/`uvloop` after
  a first install attempt got interrupted by a WSL crash mid-session)
  causing `ImportError`/`AttributeError` on startup. Fixed by deleting and
  recreating `.venv` from scratch. Not a code bug — an artifact of this
  session's environment, noted here in case a future session hits the same
  `.venv` state (it's gitignored, so it can just be recreated the same way).
- **`perfumeCatalogImporter/app.py`'s CORS middleware doesn't set
  `allow_credentials=True`**, but `frontend/src/lib/api/client.ts`'s shared
  `createApiClient()` factory hardcoded `credentials: "include"` on every
  request from **every** client, including `queryApi` (which talks to
  `perfumeCatalogImporter`, a service with no session/cookie concept at
  all). Any browser calling `/search` cross-origin got blocked with: `The
  value of the 'Access-Control-Allow-Credentials' header ... must be 'true'
  when the request's credentials mode is 'include'`. Not caused by
  favorite-hearts (`client.ts`'s `get()`/`post()` predate this feature).

  **Fixed in this worktree at the user's explicit request** (asked to fix
  it directly here rather than in a separate worktree, so it rides along
  with this branch): `createApiClient(baseUrl, options?)` now accepts
  `{ withCredentials?: boolean }`, defaulting to `true` (unchanged behavior
  for `backendApi`). `clients.ts` now constructs `queryApi` with
  `{ withCredentials: false }`, since `perfumeCatalogImporter` has no
  session to authenticate. No change needed on the Python side —
  `perfumeCatalogImporter/app.py` was left untouched (`git status` on
  `perfumeCatalogImporter/` is clean), which is the minimal fix: it avoids
  opening credentialed CORS on a service that never needed it.

  Re-verified end-to-end after the fix: real browser search against an
  **unpatched** `perfumeCatalogImporter` completed with no CORS error, and
  the search-results/profile-grid heart scenarios (item 1 and item 5 above)
  still passed.

## Test data left in the DB

Test user `favtester@example.com` / `Password123!` (id `1013`) now has
favorites left over from this pass (exact set depends on which catalog rows
were at fixed positions during the run — not cleaned up, matches the
implementation session's own precedent of leaving test data in place).

## Do not

- Delete or remove this worktree without checking with the user first — per
  root `CLAUDE.md` it stays until the feature is fully wrapped up (e.g.
  merged), not just until testing passes.
- Merge/open a PR without being explicitly asked.
