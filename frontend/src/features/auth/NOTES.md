# `features/auth` — notes

- **No token is ever stored client-side, on purpose.** The session lives in an
  httpOnly `Set-Cookie` the backend is expected to set on `POST
  /auths/login`/`register` (see `specs/auth-pages.md` — this is a documented
  *assumption* about a backend change not yet merged, re-verify against
  `backend/src/auths/` before trusting it). `useAuth` only ever caches the
  non-sensitive `User` object in `localStorage` (`mdp:auth:user`), purely to
  paint an optimistic logged-in UI on first load without a flash — it is not
  a credential and proves nothing about whether the cookie is still valid.
- **`isHydrating`/cached-user is optimistic, not verified.** There is no
  `GET /auths/me`. Any future authenticated call that gets a `401` is the
  actual signal the session died server-side; that caller is responsible for
  clearing the cached user via `logout()` and redirecting — `useAuth` itself
  doesn't intercept 401s globally (deliberately: nothing in this feature
  makes an authenticated call, so there was nothing real to test that
  interception against).
- **`logout()` calls a backend endpoint that doesn't exist yet**
  (`POST /auths/logout` — see `backend/src/auths/auths.controller.ts`, only
  `register`/`admin-register`/`login` exist). It clears local state
  regardless of that call's outcome, but until the endpoint ships, the
  httpOnly cookie is **not** actually invalidated. `features/layout/components/Navbar.tsx`'s
  "Salir" (which directly replaces "Entrar" in the same slot — see
  `specs/auth-pages.md`, "Navbar reflects session state") now calls it —
  clicking it looks like a successful logout in the UI, but the session
  cookie stays live server-side until that endpoint ships. Not a bug to
  report against this feature; a known, pre-existing gap.
- **`constants/password-policy.ts` deliberately duplicates
  `backend/src/validators/is-password-strong.validator.ts`'s five rules.**
  This is a scoped exception to "don't duplicate password rules" (see
  `specs/auth-pages.md`, "/register") made specifically for the live
  as-you-type checklist (`components/PasswordChecklist.tsx`) — that UX needs
  the rules before any round-trip exists. The backend response is still the
  only thing that actually gates a submit; if the two drift, the checklist
  becomes a stale *hint*, not a security gap. Keep the five predicates (and
  `PASSWORD_MIN_LENGTH`) in sync with `checkPasswordRules` if that validator
  ever changes.
- **`components/AuthPanelTransition.tsx` animates the /login↔/register swap
  imperatively (`animate()` from `motion/react` on a plain ref), not via
  `AnimatePresence`.** Two AnimatePresence-based attempts (one straightforward,
  one adding a `template.tsx` + a private-Next-API `FrozenRouter` hack) were
  tried first and both broke — Next replaces a layout's `{children}` for a
  sibling-route navigation as one atomic swap, so AnimatePresence never gets
  a real "old and new both present" moment to work with, regardless of which
  file owns the animated element. See `specs/auth-pages.md` ("wind
  transition") and `lib/motion.ts`'s `authPanelSweep` comment for the full
  history — worth reading before trying an AnimatePresence-based approach
  here again, since that path is already explored and confirmed unreliable
  in this exact Next version. `AuthTabs`'s links go through
  `useAuthPanelTransition()` (`hooks/useAuthPanelTransition.ts`) instead of
  plain `<Link>` navigation specifically so the exit can play before the
  route actually changes; this does cost those two links their default-nav
  fallback (intercepted client-side), an accepted trade since this whole
  route group requires JS anyway (the forms `fetch`-submit, not native HTML
  submission).
