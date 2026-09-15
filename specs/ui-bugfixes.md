# UI bugfixes — navbar, mobile carousel, animation overflow, auth render

Four small, unrelated UI fixes requested together, each scoped independently
(not a single feature). Grouped into one worktree/spec because none is large
enough to warrant its own.

## 1. "Sensei" nav item missing the wind-gust underline

`Navbar.tsx`'s desktop nav rendered "Inicio" and "Perfumes" through
`WindGustLink` (hover-drawn gust underline, `features/common/components/WindGustLink.tsx`),
but "Notas" and "Sensei" as plain `<span>`s — neither has a destination yet
(no chatbot widget wired into the layout, no notes page), so they were never
migrated when the other two items got their `href`.

### Behavior

- "Sensei" now renders through `WindGustLink` and gets the same hover gust
  underline as "Inicio"/"Perfumes".
- `WindGustLink` gained a third variant (neither `href` nor `onClick`) — a
  static label that still gets the `.nav-link`/`.nav-gust` hover treatment,
  since the CSS hover rule doesn't care what element it's on. This is the
  minimal change to reuse the shared component instead of duplicating its
  markup for a label with no action.

### Out of scope

- "Notas" is untouched — the user only asked for "Sensei". It has the exact
  same "no destination yet" shape and can get the same treatment later if
  asked.
- No destination/onClick wired for "Sensei" itself — it stays a decorative
  label until the chatbot widget (separate in-flight worktree) lands.

## 2. Mobile nav carousel never showed "Salir" when logged in

`MobileNavCarousel`'s item list (`MOBILE_NAV_ITEMS`) was a module-level
constant with a hardcoded `{ label: "Entrar", href: "/login" }` entry — it
never read auth state, so it could never become "Salir" after login, unlike
the desktop nav (which already branches on `user` for its Entrar/Salir item).

### Behavior

- The carousel's session-dependent item is now built per-render from
  `useAuth()`'s `user`: logged out → `{ label: "Entrar", href: "/login" }`
  (navigates, same as before); logged in → `{ label: "Salir", onClick:
  logout }` (calls `logout()`, then closes the menu — no navigation, matching
  desktop's "Salir" behavior).
- `MobileNavItem` gained an optional `onClick`, and the carousel renders an
  item with `onClick` as a `<button>` instead of a `<Link>`/`<span>`, reusing
  the existing tap-vs-drag detection (`handleItemClick`) so a drag gesture
  still doesn't fire the action.

### Out of scope

- No profile-link item added to the mobile carousel when logged in (desktop
  nav separately shows an avatar link outside the carousel already, at
  `md:hidden` — the carousel itself only ever carried the session action,
  not the profile link). Not asked for.

## 3. Horizontal scrollbar flashes during reveal/pagination animations

`lib/motion.ts`'s "emerge" variant (used by `FragranceList`/`FragranceCard`
for pagination and semantic search results) animates cards in from `x: 120`
(off-screen right) to `x: 0`. On any viewport where a card sits in the
rightmost column, that starting `translateX` temporarily extends past the
viewport's right edge — nothing upstream clipped it, so `html`/`body`'s
`scrollWidth` grew for the animation's duration and the browser showed a
horizontal scrollbar / let the page jump sideways.

### Behavior

- Added `overflow-x: hidden` to `html, body` in `globals.css`'s base layer —
  a single, sitewide clip instead of patching `overflow-hidden` onto every
  animated container individually. This class of bug isn't unique to
  `FragranceList`: `resultsSweep`/`heroSweep`/`authPanelSweep` in the same
  file all translate content past the viewport edge by design (that's the
  "wind carries content in/out" motif), so any of them could reproduce the
  same flash on a container that isn't independently clipped.
- Verified via a headless-Chromium (Playwright) probe at a 390px viewport:
  applying `translateX(120px)` to a full-width element pushed
  `document.documentElement.scrollWidth` from 390 to 510 without the fix,
  and stayed at 390 with it.

### Out of scope

- No change to the animation's own translate distances/timing — the fix is
  purely clipping the transient overflow, not altering the motion design.
- Not verified against the live semantic-search/pagination flows with a
  running backend + query service (out of scope to stand those up for this
  fix) — verified against the same `translateX` values the real components
  use, applied directly, which is the actual mechanism of the bug.

## 4. "El renderizado de login/registro a veces es lento" — investigated, no code defect found

Investigated with `curl` timing, a production build (`next build && next
start`), and Playwright (network/prefetch inspection, `requestAnimationFrame`
frame-timing during the tab-switch transition). Findings:

- In `next dev`, the first hit on any route (not specific to `/login`/`/register`)
  pays Turbopack's on-demand compile cost (~0.5–4s depending on how much is
  already warm) — this is standard Next.js dev-server behavior and does not
  reproduce in a production build (`/login`/`/register` are fully static
  pages, prerendered).
- Switching between the login/register tabs plays `authPanelSweep`'s exit
  (0.6s) then enter (0.8s) transition, imperatively, by design (see
  `AuthPanelTransition.tsx`'s comments and `specs/auth-pages.md` — this is
  the "wind carries one panel away and brings the other in" motif, not
  incidental). Measured end-to-end in a production build: ~680–740ms from
  click to the new form being present in the DOM, in line with those
  durations; no dropped frames observed during the transition (steady
  16.6ms/frame in a headless-Chromium trace).
- Next's default `<Link>` prefetching already warms the sibling route while
  sitting on either page (confirmed via network trace in a production
  build); an explicit `router.prefetch()` was tried and measured to make no
  difference (676ms vs. 694ms, within noise), so it was **not** kept — it
  would have been dead code addressing nothing.
- No expensive computation, unnecessary data fetching, or heavy import was
  found in the auth feature's components.

**Not fixed — confirmed as expected `next dev` behavior, not a bug.** The
user confirmed they observed this via `pnpm dev`, not a production build.
Turbopack compiles each route on demand the first time it's hit in a dev
session (up to ~4s here), which is standard for any Next.js route, not
specific to login/register; it doesn't reproduce in `next build && next
start`, where both pages are static and the tab-switch settles in ~700ms
(the intentional 0.6s/0.8s wind-sweep transition, not slow by itself). No
code change made.
