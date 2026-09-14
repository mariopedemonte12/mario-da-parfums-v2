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

## Out-of-scope observations (not user-profile bugs, flagging for awareness)

1. **No navbar link to `/profile`.** `Navbar.tsx`'s logged-in avatar is a plain `<span>` with initials, not a `<Link>`. Not in user-profile's declared spec scope, but it's the reason the isHydrating bug above was guaranteed to hit on every visit — worth a follow-up ticket against `auth-pages`/navbar ownership.
2. **`useAuth.tsx`'s `logout()` doesn't catch the `POST /auths/logout` 404.** `try { await authApi.logout() } finally { clear state }` still re-throws after `finally` runs, so `Navbar`'s `onClick={logout}` produces an uncaught promise rejection — visible as a Next.js dev "Runtime ApiError" overlay when clicking "Salir" in a real browser. State clears correctly regardless (confirmed), but the uncaught error is a real UX defect. File is owned by `auth-pages`, not touched here.
3. **DB-level bug (unrelated to auth-pages or user-profile)**: `users.name` has a `.unique()` constraint (`database/schema/user.schema.ts`), and `auths.service.ts`'s `23505` catch always reports "Email already registered" regardless of whether it was actually the `name` or `email` column that collided — misleading error message. Cost some time during testing (two different test users with the same literal name collided). Not fixed, just flagged.

## Lint / type-check

- `frontend`: `pnpm tsc --noEmit` clean, `pnpm lint` clean.
- `backend`: `pnpm tsc --noEmit` has pre-existing, out-of-scope errors (missing `supertest/types` module, a few unrelated e2e-spec type mismatches) — already present on `master`, not introduced here. `pnpm lint` only pre-existing unused-import warnings in unrelated schema files.

## Status

Feature matches spec. One bug found and fixed (with explicit user sign-off) during this session; three out-of-scope observations documented above for awareness/follow-up. Worktree left in place, not merged/PR'd (per convention — only on explicit request).
