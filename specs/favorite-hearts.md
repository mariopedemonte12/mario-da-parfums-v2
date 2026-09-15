# favorite-hearts

Frontend-only feature. Lets a logged-in user mark/unmark a fragrance as
favorite from anywhere it's shown, using the heart affordance already
established in the `/profile` mock (transparent outline → filled black when
favorited). Consumes the existing `favorites` backend module
(`specs/favorite-module.md`) — no backend changes.

## Scope

A reusable heart toggle (`FavoriteHeart`), wired into every place a fragrance
is already rendered:

- **Fragrance detail** (`/fragrances/[id]`, `FragranceHero`): heart on the
  hero image, top-right corner.
- **Catalog / general listing** (`/fragrances`, `FragranceCard`): heart
  overlaid on each card's image, top-right corner.
- **Semantic search results** (`/`, `SearchResults`): heart on the
  protagonist match and on each secondary match row.
- **Profile** (`/profile`, `FavoritesGrid`): heart on each saved fragrance,
  already filled (it's a favorite by definition of being in that list);
  clicking it unmarks and the card leaves the grid.

No new route, no new page. Existing components are extended, not replaced.

## Behavior

- Unfavorited: heart outline, transparent fill. Favorited: outline + solid
  black fill. Toggling is optimistic — the fill flips immediately on click,
  before the network request resolves.
- Click on a heart never triggers the card's own navigation (`Link` to
  `/fragrances/:id`) — `preventDefault`/`stopPropagation` on the heart
  button.
- State is held in one app-wide favorites context (`FavoritesProvider`,
  mounted in the root layout inside `AuthProvider`), fed by
  `GET /favorites?page=1&limit=100` once per session (on login / on mount
  with an existing session). All hearts across the app read from and write
  to this single set of favorited fragrance ids, so marking a fragrance
  favorite on the catalog page is immediately reflected if the same
  fragrance is also visible elsewhere (e.g. already open in another tab is
  out of scope — same-tab consistency only).
- Marking calls `POST /favorites/batch` with `{ fragranceIds: [id] }`;
  unmarking calls `DELETE /favorites/batch` with the same shape — both are
  the existing batch-of-one convention, no new backend endpoints.
- If the request fails, the optimistic toggle is reverted (heart flips back)
  and the click is otherwise silent — no toast/banner. Consistent with how
  little error UI the rest of the catalog/search views have today.
- **Not logged in**: clicking a heart redirects to `/login` instead of
  toggling anything (mirrors the "Entrar" link's destination in the
  Navbar). No favorites are fetched for a logged-out session — the context
  holds an empty set and every heart renders unfilled.
- A heart is disabled (not clickable, but same visuals) while its own
  toggle request is in flight, to prevent a double-click firing two
  overlapping requests for the same fragrance.

## Explicitly out of scope

- Favorite counts / "N users favorited this" (backend has
  `GET /favorites/fragrances/:id/count`, but the mock doesn't show it
  anywhere and the user didn't ask for it here).
- Pagination beyond the first 100 favorites for building the id set — if a
  user has favorited more than 100 fragrances, hearts for the overflow
  render unfilled until unfavorited/refavorited in-session. Matches
  `user-profile.md`'s existing "no pagination" stance for this MVP.
- Any backend/database change — the `favorites` module is complete and
  unmodified by this feature.
- Toast/error banner UI for a failed favorite toggle.
