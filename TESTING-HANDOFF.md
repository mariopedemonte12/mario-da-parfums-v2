# Testing handoff — user-profile

Session: independent testing session, spec `specs/user-profile.md`, worktree `worktree-user-profile`. Date: 2026-09-14.

## Pre-testing: merged master in

Brought in master's `bf7c013` (auth-pages), `59dec0b` (layout/navbar), `77b7395` (home-search) — see the two merge/fix commits ahead of this one for full detail. Auth files (`useAuth.tsx`, `auth.api.ts`, `user.types.ts`, `lib/api/client.ts`) resolved in favor of master's real implementation, which supersedes this worktree's stopgap. Fixed the resulting `ApiError` import/property fallout in `useProfile.ts` (`statusCode`, not `status`; moved to `lib/api/errors.ts`).

Servers run on the **default** ports for this session (per user request, to match `main.ts`'s CORS default without an env override): backend `PORT=4003`, frontend port `3010` (`main.ts`'s CORS origin defaults to `http://localhost:3010`).

**Environment gap found**: `JWT_SECRET` was not set in this worktree's `.env`, nor documented in `.env.example` (on this worktree or on master) — register/login 500'd with `secretOrPrivateKey must have a value` until the user added it manually. Pre-existing gap, unrelated to user-profile; worth fixing `.env.example` at some point but out of this feature's scope.

## Bug found and fixed (with user approval): premature session-expired redirect

**`/profile` always redirected a logged-in user to `/login`, on every realistic visit.** Root cause: `Navbar.tsx` has no link to `/profile` (the logged-in avatar is a `<span>`, not a `<Link>` — see "out-of-scope observation" below), so the *only* way to reach `/profile` is a full page load (typed URL, bookmark, refresh). `useProfile.ts` destructured only `{ user, logout }` from `useAuth()`, ignoring the `isHydrating` flag master's real `useAuth` exposes specifically so callers can distinguish "still reading the cached session from localStorage" from "definitely logged out" (see `features/auth/NOTES.md`). On the first render after a full page load, `user` is `null` while hydration is still async; `useProfile`'s `if (!user) return sessionExpiredState` fired synchronously on that first render (child effects run before parent effects, so this beat `AuthProvider`'s own hydration effect), and `ProfilePage` redirected to `/login` immediately.

Confirmed via network trace: `GET /users/:id` and `GET /favorites` both came back `200` with correct data milliseconds later — the fetch was already in flight when the redirect fired. 100% reproducible across repeated runs (not a timing flake).

**Fix applied** (`frontend/src/features/profile/hooks/useProfile.ts`, commit `3eaf23a`): wait for `isHydrating` to resolve before deciding `sessionExpired`. Verified fix resolves the issue — `/profile` now renders correctly on a fresh page load with a valid session.

## Spec scenarios tested (all pass, post-fix)

- **Identity block**: name, "Miembro desde <mes> de <año>" (from `createdAt`), email — real data from `GET /users/:id`. ✅
- **Favorites, populated**: 25 favorited fragrances (via `POST /favorites/batch`) render name/brand/olfactory-family; shows "+5 MÁS" (25 total − 20 returned), no pagination controls. ✅ matches spec exactly.
- **Favorites, empty**: site-voice empty-state copy ("Todavía no guardaste ningún perfume...") — not an empty grid. ✅
- **`photoS3Key: null`**: diagonal-stripe placeholder circle, never a broken `<img>`. ✅
- **401 on `/users/:id` or `/favorites`**: tampered session cookie → both calls 401 → `logout()` called (localStorage cache cleared, confirmed `null`) → clean redirect to `/login`, no generic error banner. `POST /auths/logout` itself 404s (documented pre-existing gap in `auth-pages`, not a user-profile bug) but doesn't block the redirect. ✅
- **Generic error** (mocked 500 on `/users/:id`): "No se pudo cargar tu perfil." shown, **no redirect**, stays on `/profile`, session intact (navbar still shows "Salir"). ✅
- **`user === null` at mount** (no session, fresh tab): redirects to `/login`, zero API calls. ✅
- **Register → `/profile`** and **Login → `/profile`**: both work end-to-end, `session` cookie set `httpOnly`, `SameSite=Lax`. ✅
- **Mobile viewport** (390×844): clean single-column stack, no overflow. ✅
- **Confirmed NOT implemented** (per spec's explicit cut list): no estela/afinidad %, no pedidos-entregados/perfume-más-buscado tiles, no sidebar tabs, no `PATCH /users/:id` call anywhere in the feature — grepped clean. ✅

## Out-of-scope items fixed at explicit user request (commit `cd585b6`)

These touch `features/auth` and `features/layout` (owned by `auth-pages`, not `user-profile`) — done because the user asked directly, not on this session's own initiative:

1. **Navbar avatar now links to `/profile`.** Was a plain `<span>` with initials — no way to reach `/profile` from the UI at all (this is what made the isHydrating bug above hit on *every* visit, since a full page load was the only path in). Both the mobile and desktop avatar now use `WindGustLink` (extended with an `ariaLabel` prop, since initials alone don't describe the link) to navigate to `/profile`, responsive by construction since it's one shared component at both breakpoints, and picks up the same hover gust-underline as the rest of the navbar for free. Verified: click navigates correctly at both viewport sizes, hover draws the gust in under the avatar exactly like "Inicio"/"Perfumes"/"Salir".
2. **`useAuth.tsx`'s `logout()` now catches the `POST /auths/logout` 404.** It re-threw past its `finally` before, so `Navbar`'s `onClick={logout}` produced an uncaught promise rejection — visible as a Next.js dev "Runtime Error" overlay when clicking "Salir". Local state already cleared correctly regardless (confirmed); now the failure itself is caught so it doesn't propagate. Verified: no `pageerror` after clicking "Salir" anymore — only the browser's own unavoidable network-log line for the 404 itself remains.

## Backend fixes — tracked in their own branch, not this one

The two backend issues flagged earlier in this doc (`POST /auths/logout` missing, misleading `23505` conflict message) briefly showed up as uncommitted changes in this worktree mid-session and were committed here (`02b65c4`), then **reverted** (`66ffc3e`) once it became clear they already exist as their own committed, dedicated feature: worktree `auth-logout-conflict-messages` (branch `worktree-auth-logout-conflict-messages`, commit `8813cdb`, spec `specs/auth-logout-conflict-messages.md`), awaiting its own separate testing session. Keeping them out of `user-profile`'s branch avoids a duplicate/conflicting commit when that branch merges on its own. Re-tested `useAuth`'s `logout()` end-to-end against that worktree's real endpoint before reverting here — 0 console/page errors (the `catch` from commit `cd585b6` in *this* branch handles the 404 regardless of whether that endpoint exists yet).

## Lint / type-check

- `frontend`: `pnpm tsc --noEmit` clean, `pnpm lint` clean.
- `backend`: `pnpm tsc --noEmit` has pre-existing, out-of-scope errors (missing `supertest/types` module, a few unrelated e2e-spec type mismatches) — already present on `master`, not introduced here. `pnpm lint` only pre-existing unused-import warnings in unrelated schema files.

## Status

Feature matches spec. One in-scope bug found and fixed (isHydrating race, with explicit user sign-off); two out-of-scope frontend items fixed at explicit user request (navbar avatar link, logout error handling). The two backend issues this session flagged are fixed in their own dedicated branch (`worktree-auth-logout-conflict-messages`), kept out of this one. Pushed and PR opened at explicit user request.
