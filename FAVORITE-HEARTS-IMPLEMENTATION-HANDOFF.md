# Implementation handoff — favorite-hearts

Session: implementation session, spec `specs/favorite-hearts.md`, worktree
`.claude/worktrees/favorite-hearts`, branch `worktree-favorite-hearts`.

Note: this worktree's root also has `IMPLEMENTATION-HANDOFF.md`,
`TESTING-HANDOFF.md` and `SECURITY-HARDENING-TESTING-HANDOFF.md` — all three
belong to `security-hardening`/`user-profile`, merged into `master` before
this worktree branched off it. Leave them alone; this doc is the one that's
actually for this feature.

## Status: implementation complete, frontend-only

Backend needed **no changes** — the `favorites` module (mark/unmark, list,
per-fragrance count) already existed on `master`, complete, spec at
`specs/favorite-module.md`. This pass only touched `frontend/`:

- New `frontend/src/features/favorites/` module: `FavoritesProvider`
  (app-wide context, one `GET /favorites?limit=100` per session, exposes
  `isFavorite`/`toggleFavorite`/`isPending`/`loaded`) and `FavoriteHeart`
  (the transparent→black heart button; redirects to `/login` if the caller
  isn't authenticated; optimistic toggle, reverts on request failure).
- Wired into: `FragranceCard` (catalog), `FragranceHero` (detail page),
  `SearchResults` (protagonist + each secondary semantic-search match),
  `FavoritesGrid` (profile page — hearts start filled, click unfavorites and
  the card leaves the grid).
- `frontend/src/lib/api/client.ts` gained a `delete<T>(endpoint, body)`
  method (only `get`/`post` existed before) — needed for
  `DELETE /favorites/batch`.
- `frontend/src/app/layout.tsx`: `FavoritesProvider` now wraps the tree,
  nested inside `AuthProvider` (needs `user`/`isHydrating` from it).

Full design decisions and explicit scope cuts: `specs/favorite-hearts.md`.

## Verified this pass

`pnpm lint` and `pnpm build` (real `next build`, not bare `tsc` — this repo's
root layout uses Next's generated `LayoutProps` type, which only exists
after a real build) both clean.

Manually driven with Playwright against a real running instance (backend
`PORT=3010`, frontend `next dev --port 3011`, real Postgres via
`docker-compose`, not mocked):

- Registered a test user, logged in, opened `/fragrances`: every card shows
  an outlined heart; clicking one fills it black immediately, **without**
  navigating to the detail page (`stopPropagation`/`preventDefault`
  confirmed via `page.url()` staying on `/fragrances`).
- `/profile` → "Guardados" showed the favorited fragrance with a filled
  heart. Clicking that heart removed the card from the grid live (no
  reload).
- `/fragrances/:id` detail page: heart renders correctly positioned on the
  hero image, reflects the same global favorite state.
- Screenshots taken and visually compared against the mock's look
  (transparent outline / filled black) — matches.

**Not verified**: the `SearchResults` heart placement (home page, after a
semantic search). `perfumeCatalogImporter` (the FastAPI search
microservice) wasn't running in this pass, so the search always hit its
error state and the success branch (where the hearts live) never rendered.
The JSX is structurally identical to the already-verified `FragranceCard`
placement (same `FavoriteHeart` component, same click-guard pattern) and
the app builds/lints clean, but it has not been *seen* rendering. **This is
the one thing the testing session should prioritize actually looking at.**

## Next: testing session

Per root `CLAUDE.md`, verification is a **separate** Claude Code session
against this same worktree — do not test-and-implement together. Use the
`testing` skill; treat `specs/favorite-hearts.md` as the source of truth for
intended behavior, not a re-read of the implementation.

Suggested focus, beyond the general spec-based pass:

1. **Drive a real semantic search** on `/` (needs `perfumeCatalogImporter`
   running — check `chatbot/` or that service's own README/`.env.example`
   for how to start it) and confirm the protagonist and secondary-match
   hearts render, toggle, and don't break the card's own `Link` navigation.
2. **Not-logged-in path**: click a heart while signed out → should redirect
   to `/login` without ever calling the favorites API (nothing to toggle,
   no console error). Confirmed structurally, not yet clicked through with
   `user === null` from a cold session.
3. **Optimistic-failure revert**: no scenario was found in this pass that
   makes `POST/DELETE /favorites/batch` fail post-auth (both are
   straightforward with a valid session), so the revert-on-error path in
   `useFavorites.tsx` is implemented but unexercised. Worth a deliberate
   attempt (e.g. stop the backend mid-click, or favorite the same fragrance
   twice quickly to hit the batch endpoint's conflict case) to confirm the
   heart actually flips back rather than sticking in the wrong state.
4. **>100 favorites edge case** (`specs/favorite-hearts.md`'s explicit
   scope cut): not practical to hit manually, but worth reading
   `useFavorites.tsx`'s `listFavoriteIds` call to confirm the cut is real
   and intentional, not an oversight.

## Gotchas hit this pass (so they aren't re-discovered)

- **Backend CORS defaults to `http://localhost:3010`**
  (`backend/src/main.ts`, `FRONTEND_URL` env var). Running the frontend dev
  server on any other port (I used `:3011` to avoid clashing with other
  worktrees) makes login/register silently no-op — page just stays on
  `/login`, no visible error, no console output via curl. Pass
  `FRONTEND_URL=http://localhost:<actual-port>` to the backend process if
  running both manually. (Saved as memory `backend-cors-default-port`.)
- **`JWT_SECRET` is still missing from `backend/.env.example`** — same gap
  `user-profile`'s and `security-hardening`'s testing sessions already hit.
  `backend/.env` and any other real `.env` file are blocked from being
  read/written by this sandbox (only `*.example` is allowed) — the only
  viable path for a manually-started dev server is exporting `JWT_SECRET`
  (and `DATABASE_URL`, `PORT`, `FRONTEND_URL`) as **process env vars**
  directly on the `pnpm start:dev` command line, not editing `.env`.
- Postgres (`backend/docker-compose.yml`) was already running and shared
  across worktrees (`backend-postgres-1` container, pre-existing data from
  other worktrees' testing sessions) — no need to start it fresh or seed
  fragrances, there's already a real catalog in it.
- Playwright: no MCP browser tool in this environment, but `playwright` npm
  (matching the cached Chromium via `npx playwright --version`) works fine
  via a plain Node script run from the scratchpad dir — see memory
  `playwright-available-locally` for the exact setup steps.

## Test data created this pass (left in the DB, not cleaned up)

- Test user: `favtester@example.com` / `Password123!` (role `user`, id
  `1013` at creation time) — reusable for the testing session, or make a
  fresh one.
- That user favorited and then unfavorited fragrance `Cosmopolitan Dubai`
  (`00123a2d-3dee-42b1-9e82-ed96ca0ff4b5`) during verification — ends the
  pass with **zero** favorites, so `/profile` will show the empty state
  ("Todavía no guardaste ningún perfume...") until the testing session
  favorites something.

## Do not

- Delete or remove this worktree — a testing session still needs it.
- Test-and-implement in the same session.
- Merge/open a PR without being explicitly asked.
- Touch `IMPLEMENTATION-HANDOFF.md` / `TESTING-HANDOFF.md` /
  `SECURITY-HARDENING-TESTING-HANDOFF.md` at this worktree's root — not
  this feature's, see the note at the top.
