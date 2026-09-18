# Auth pages — `/login`, `/register`

## Purpose

Build the login and register screens (mock artboard 1h, "Login / Register —
panel dividido, viento cruza el pliegue") and the frontend auth plumbing they
need: `features/auth/api`, `features/auth/hooks/useAuth`, and the split-panel
UI. Depends only on `design-foundation` (merged).

This spec also fixes pre-existing drift in `features/auth/` (wrong endpoint
path, lowercase type, missing `login()`) and documents a **contract
assumption about a backend change that has not landed yet** — see next
section. Everything here was written/implemented against that assumption,
not against the backend code as it exists in this worktree today.

## Contract assumption: cookie-based session (not yet merged)

As of this worktree, `backend/src/auths/auths.service.ts` still returns
`{ accessToken, user }` in the response body (`buildAuthResponse`), no
`Set-Cookie`. A parallel, not-yet-merged backend change is expected to
replace this with an **httpOnly, `SameSite=Lax` session cookie**, dropping
`accessToken` from the body entirely:

- `POST /auths/login` and `POST /auths/register` respond `{ user: UserResponseDto }`.
- The session credential arrives via `Set-Cookie` on that same response; the
  frontend never reads, stores, or attaches it manually — the browser sends
  it automatically on same-site fetches to the backend as long as
  `credentials: 'include'` is set (see below).
- `UserResponseDto` (`backend/src/users/dto/response-user.dto.ts`, current
  shape): `id`, `name`, `email`, `role`, `photoS3Key: string | null`,
  `createdAt`.

**This is an assumption, not a verified fact.** If the actual cookie change
lands with a different cookie name, a different body shape, or additional
fields, the code implemented here (`features/auth/api/auth.api.ts`,
`features/auth/types/`) needs a follow-up pass to match it — re-read
`backend/src/auths/` at that point rather than trusting this doc.

Consequences implemented throughout the frontend:

- No `accessToken`/JWT is ever stored by the frontend (not in `localStorage`,
  not in a JS-readable cookie, not in the auth context). There is nothing to
  attach to outgoing requests by hand.
- `lib/api/client.ts`'s `get`/`post` always send `credentials: 'include'`, so
  the cookie round-trips to the backend on every call. `SameSite=Lax` only
  governs whether the cookie is sent on cross-site navigations/requests, not
  whether `fetch` attaches or accepts cookies at all — that's what
  `credentials: 'include'` is for, and both are required together for a
  cross-origin frontend/backend split. Backend CORS needs
  `credentials: true` and an explicit origin (not `*`) for this to work —
  that's the backend change's responsibility, not this feature's, but if
  cookies don't round-trip when integrating against the real backend change,
  check that first.

## Fixes to existing drift (unrelated to the cookie assumption)

- `features/auth/api/auth.api.ts` called `POST /auth/register` (singular).
  The real controller (`backend/src/auths/auths.controller.ts`) is mounted at
  `/auths` (plural) — fixed to `/auths/register`. `login()` was entirely
  missing — added, calling `POST /auths/login`.
- `features/auth/types/user.types.ts` exported `user` (lowercase, missing
  `role`). Replaced with `User` (PascalCase), matching `UserResponseDto`:
  `id`, `name`, `email`, `role`, `photoS3Key`, `createdAt`.
- `features/auth/hooks/useAuth.tsx` was empty. Implemented as a
  context/provider (see below).

## `useAuth` contract

This is the interface other features (`user-profile`, in parallel) should
assume when this merges — the shape is considered stable even though the v1
implementation underneath (see "Session hydration" below) is explicitly a
stopgap.

```ts
type AuthContextValue = {
  user: User | null;
  isHydrating: boolean; // true only during the initial mount hydration pass
  login: (params: LoginParams) => Promise<User>;
  register: (params: RegisterParams) => Promise<User>;
  logout: () => Promise<void>;
};
```

- No `token`/`accessToken` field — there is no token to expose, by design.
- `login`/`register` throw `ApiError` (see below) on failure; callers (the
  form components) catch it and render field/form errors. On success they
  resolve with the `User` and the context's `user` is already updated.
- Consumers needing "is someone logged in" read `user !== null`. Consumers
  needing "have we finished checking" read `isHydrating` (useful to avoid a
  flash of logged-out UI on first paint — e.g. Navbar or a route guard).

### Session hydration (v1 stopgap — documented decision, not a fact about the backend)

The cookie is httpOnly: the frontend cannot read the JWT to determine "is
there a session" on page load, and there is currently no `GET /auths/me` (or
equivalent) to ask the backend directly. Until one exists, `useAuth` does:

1. On successful `login`/`register`, cache the returned `User` (non-sensitive
   fields only — id/name/email/role/photoS3Key/createdAt, never a token) into
   both the React context and `localStorage` (`mdp:auth:user`).
2. On mount, hydrate the context synchronously from that `localStorage` cache
   (if present) so the UI can paint an optimistic logged-in state without a
   flash — `isHydrating` is `true` only for the duration of this synchronous
   read, so in practice it resolves within the same tick/first render.
3. This is **optimistic, not verified** — the cookie backing it may have
   expired or been invalidated server-side without the frontend knowing. The
   contract for any feature making an authenticated call: if a request comes
   back `401`, treat it as "the session is gone" — call `logout()` (or the
   equivalent local-clear path) to wipe the cached/contextual `user` and
   redirect to `/login`. This feature does not itself make any authenticated
   call (login/register are public endpoints), so no 401-handling code is
   exercised here yet; the pattern is documented so the next feature to add a
   protected call (`user-profile`, `favorites`) follows it consistently
   instead of reinventing it.

**When `GET /auths/me` (or similar) exists**, this whole mechanism should
collapse to: on mount, call it; treat 200 as logged-in (use the returned
user, no need for the localStorage cache at all) and 401 as logged-out. That
is the real fix — this is a v1 patch to ship `auth-pages` without waiting on
a new backend endpoint, not a pattern to defend once a real one exists.

## `POST /auths/logout` does not exist — blocking gap for real logout

`backend/src/auths/auths.controller.ts` only has `register`, `admin-register`,
and `login`. With an httpOnly cookie, **the frontend cannot delete the cookie
itself** — logout requires the backend to expose an endpoint that responds
with an expired/`Max-Age=0` `Set-Cookie` for the session cookie.

`useAuth`'s `logout()` is implemented to call `POST /auths/logout` and then
clear the local context + `localStorage` cache regardless of the call's
outcome. Today, that call **will 404** (the route doesn't exist), so calling
`logout()` currently only clears client-side UI state — **the session cookie
stays valid on the server**, i.e. this is not a real logout yet. This is
called out here explicitly per the root workflow's testing-session
handoff: **do not treat `logout()` as "working" until `POST /auths/logout`
ships on the backend** — a testing session should flag a "successful" logout
that leaves the cookie live as the expected/known gap described here, not as
a newly-discovered bug, and should re-verify once the endpoint exists.

**Resolved 2026-09-14**: `POST /auths/logout` now exists — see
`specs/auth-logout-conflict-messages.md` and `backend/src/auths/NOTES.md`.
The gap this section describes (404, cookie stays live) is closed; a
testing session exercising `logout()`/"Salir" from here on should verify it
as a real logout (session cookie actually cleared, `204` from the backend),
not wave it through as this known limitation.

No UI in this feature calls `logout()` — see "Navbar" below.

## Scope: `/login` and `/register`

Mock artboard 1h is a single split-panel layout with a tab switcher between
"Entrar" (login) and "Crear cuenta" (register); implemented as two routes
(`/login`, `/register`) sharing one presentational layout
(`features/auth/components/AuthSplitPanel.tsx`), consistent with the FASE1
routing table. **Each route keeps its own URL/history entry — this is a
routing decision, not client tab-state** (see next section for why the
"wind" transition doesn't change this).

### "Wind" transition between `/login` and `/register` (added after initial ship)

Switching between login/register animates as one wind gust carrying the
current panel away and bringing the other one in, instead of a hard page
navigation. Two ways to get this were on the table:

1. Collapse `/login`/`/register` into one route with client tab-state.
2. Keep two real routes, animate the swap at the layout level.

**Chose (2)**, so the "two separate routes, own history entry" decision
above stands unchanged. Next.js App Router's own View Transitions support
was also considered and rejected for now: it depends on React's
experimental `<ViewTransition>` component, which does **not** exist in this
worktree's React (`react@19.2.8`, a stable release — confirmed
`Object.keys(require('react'))` has no `ViewTransition`/`unstable_ViewTransition`
export). That component currently only ships in React's canary/experimental
channel, not in a pinned stable release, so wiring it in now would mean
either pulling in an experimental React build or hand-rolling the
browser-native `document.startViewTransition()` API around App Router's
internals — both bigger, riskier changes than this feature warrants.

**Not implemented with `AnimatePresence`.** Two AnimatePresence-based
attempts were tried first (one with the animated `motion.div` directly in
`app/(auth)/layout.tsx`, one with it split into a sibling
`app/(auth)/template.tsx` plus a `FrozenRouter` context-freezing hack) and
both broke in practice, for the same underlying reason: Next swaps a
layout's `{children}` prop for a sibling-route navigation as one atomic
replace (the layout itself never remounts, and even a fresh `template.tsx`
instance is still live React once mounted), so AnimatePresence never
actually gets a moment where the old and new content are both genuinely
present for it to diff and defer removal of. Depending on the exact setup
this showed up as either the exiting panel flashing to the *new* route's
content mid-exit, or the exit not playing at all (the second box
effectively never appearing). Chasing this further down the
AnimatePresence path (there are more exotic workarounds in the wild) was
judged not worth it — this is a known, still-unreliable corner of
Next.js App Router + Framer Motion, not a straightforward two-line fix.

**Implemented instead as a plain imperative animation**, fully decoupled
from Next's own mount/unmount timing:
`features/auth/components/AuthPanelTransition.tsx` (rendered by
`app/(auth)/layout.tsx`, a route group — adds no URL segment, so `/login`
and `/register` are unaffected) owns a ref to a wrapper `<div>` around
`{children}` and exposes a `navigateWithExit(href)` function via context
(`features/auth/hooks/useAuthPanelTransition.ts`). `AuthTabs`'s links call
it instead of navigating directly (`WindGustLink`'s `onNavigate` prop
intercepts a plain click, letting modifier-key/middle clicks fall through
to normal `<Link>` behavior for accessibility): `navigateWithExit` calls
`animate()` (from `motion/react`, `motion`/`authPanelSweep.exit` in
`lib/motion.ts`) on the wrapper's *current* DOM — still showing the old
route, since nothing has navigated yet — awaits it finishing, and only
then calls `router.push(href)`. A `useEffect` keyed on `pathname` plays the
`show` variant once the new route's content has mounted into that same,
never-unmounted wrapper. Since this never asks Next/AnimatePresence to
infer anything from an ambiguous children swap, it can't be undermined by
how that swap actually happens. **Verified with a throwaway Playwright
script** (not part of the codebase) driving the real dev server: console
timestamps confirmed the exit phase takes ~0.6s and the enter phase ~0.8s
in both directions, and screenshots taken every 150ms through the
transition confirmed the old route's own content (not the new route's) is
what's visibly sliding away during the exit.

This costs the two "Entrar"/"Crear cuenta" links their default-navigation
fallback (they're intercepted client-side; a no-JS visitor wouldn't
navigate on click) — an acceptable trade here since this whole route group
already requires JS (the forms submit via `fetch`, not native HTML
submission). Next.js App Router's own View Transitions support was also
considered and rejected for now: it depends on React's experimental
`<ViewTransition>` component, which does **not** exist in this worktree's
React (`react@19.2.8`, a stable release — confirmed
`Object.keys(require('react'))` has no `ViewTransition`/`unstable_ViewTransition`
export). That component currently only ships in React's canary/experimental
channel, not in a pinned stable release, so wiring it in now would mean
pulling in an experimental React build — a bigger, riskier change than
this feature warrants. If React ever ships `<ViewTransition>` in a stable
release this app adopts, revisit — it would let the same two-routes
decision use the browser-native transition instead of a hand-rolled one.

**`AuthTabs` is deliberately excluded from the animated wrapper** — the
user explicitly wants the "Entrar"/"Crear cuenta" selector to stay static,
not get carried along with the panel sweep. `AuthTabs` renders inside
`AuthPanelTransition`, as a sibling *before* the ref-wrapped `{children}`
div, with its active tab derived from `pathname` there
(`pathname === "/register" ? "register" : "login"`) rather than from a
`tab` prop — `AuthSplitPanel` no longer takes or renders a `tab` prop at
all, since tab state now lives one level up.

### Tab selector: outside the panel, navbar-style wind underline (added after initial ship)

`AuthTabs.tsx` (the "Entrar" / "Crear cuenta" switcher) moved from inside
the form panel to `AuthPanelTransition` (see above — outside
`AuthSplitPanel` entirely, and outside the panel-transition's animated
wrapper, so it stays static), and its active-state indicator changed from
a plain `border-b` underline to the navbar's wind-gust hover effect
(`.nav-link`/`.nav-gust` in `features/layout/components/Navbar.tsx` —
animated SVG line strokes drawn in under the link; see "Wind motif" in
`frontend/CLAUDE.md`, now shared via `features/common/components/WindGustLink.tsx`),
so the same underline motif that reacts to hover in the navbar also marks
which tab is active here. Sequenced after the transition decision above
since it shares the same component the wind transition wraps.

## Navbar reflects session state (added after initial ship)

`features/layout/components/Navbar.tsx` now reflects `useAuth().user`: when
`user` is `null` it renders "Entrar" (unchanged); when a `user` is present,
**"Salir" simply takes the same slot "Entrar" occupied** — no dropdown/menu
(an earlier version of this used an avatar-triggered dropdown menu; the
user explicitly preferred "Salir" just replacing "Entrar" directly, so that
dropdown was removed). "Salir" reuses the same `WindGustLink` component as
"Entrar" (extended to accept an `onClick` instead of an `href`, rendering a
`<button>` instead of a `Link` — see `features/common/components/WindGustLink.tsx`),
calling `useAuth().logout()` on click. The circle avatar next to it still
switches from empty to initials-from-`name`, unchanged in position. The
avatar is **initials from `name` only, not a `photoS3Key`-backed image**:
there is no S3 base-URL/key-to-image resolution anywhere in this codebase
yet (the backend only validates the key's shape —
`backend/src/users/dto/update-user.dto.ts` — nothing serves or exposes it
as a URL), so building a photo avatar now would mean inventing that
infrastructure unreviewed. Revisit once that resolution exists (likely from
`user-profile`, which needs the same mapping for its own photo display).

**Desktop only for now**: "Entrar" ↔ "Salir" swapping is wired on the
`md:flex` desktop nav. The mobile hamburger menu's carousel
(`MOBILE_NAV_ITEMS`) still statically shows "Entrar" and isn't wired to
session state or given a "Salir" action — its data model is a static href
list with no concept of an action item, and reworking that was out of
scope for this pass. The mobile top-bar circle (next to the hamburger
button) does switch to initials when logged in, so the mobile header isn't
visibly wrong, but there's no way to log out from a phone yet. Flagging as
a known gap, not a bug, for the testing session.

**Known limitation, carried over from the main handoff above, not
reintroduced here**: `POST /auths/logout` still 404s on the backend (see
"`POST /auths/logout` does not exist" above). Clicking "Salir" still only
clears local state (context + `localStorage` cache) — it does **not**
invalidate the session cookie server-side. This was true before this
Navbar change and remains true after it; implementing the backend endpoint
was explicitly not bundled into this work. A testing session should treat a
"successful" Salir that leaves the cookie live as this known gap, not a new
bug — same caveat as the main handoff's `logout()` section.

**Resolved 2026-09-14** — see the addendum on the main handoff's `logout()`
section above; "Salir" now performs a real server-side logout.

## Screens

Both screens share `AuthSplitPanel`: a fixed-width two-column layout on
desktop (dark `bg-primary`/`text-primary-foreground` left panel with
`WindLines`, brand wordmark, a serif headline, and a short poetic subline;
light form panel on the right), collapsing to a single column (form only,
left panel's copy shown as a compact header) below `md`. Per mock: pill
inputs are **not** used here — fields are bottom-border-only
(`border-b border-border`, serif value text), matching artboard 1h exactly;
this is a deliberate mock-specific divergence from the generic pill-shaped
`Input` primitive, scoped to `features/auth/components/`, not a change to
`components/ui/`.

### `/login`

- Fields: email, password. Both required (matches `LoginDto`).
- "Recordarme" checkbox and "Olvidé mi contraseña" link are rendered from
  the mock for visual fidelity but are **non-functional/decorative** — there
  is no "remember me" concept with a single httpOnly session cookie, and no
  password-reset endpoint exists. Out of scope; not wired to anything.
- "o continúa con" / Google / Apple buttons: rendered for visual fidelity
  only, **disabled** (no social-auth backend exists). Out of scope.
- On submit: call `useAuth().login({ email, password })`.
  - Success → redirect to `/` (home). (No return-to-previous-page tracking
    in v1 — out of scope.)
  - Failure: backend's `login` deliberately returns the same
    `401 Invalid email or password` for both "no such email" and "wrong
    password" (see `backend/src/auths/NOTES.md` — enumeration prevention).
    The form surfaces one generic message: *"Correo o contraseña
    incorrectos."* — not per-field, since the backend gives no per-field
    signal to distinguish them.
  - Any non-401 error (network, 500) → generic *"Ocurrió un error. Intentá
    de nuevo."*

### `/register`

- Fields: name, email, password. All required (matches `RegisterDto`).
- Client-side: fields are required (empty-submit prevented) but **strength/format
  validation of the actual submit is still deferred to the backend's
  response** — the backend's `errors[]` codes remain the single source of
  truth for whether a submitted password is accepted (see next point), so
  submit-time "helper text" is *derived from what the backend rejected on
  the last attempt*, not from a re-implemented copy of `IsStrongPassword`'s
  rules. This avoids the two validators drifting out of sync **for the
  submit path**.
- **Live password-requirements checklist (added after initial ship)**: as
  the user types into the password field, each rule (min 8 chars, mayúscula,
  minúscula, número, carácter especial) ticks off live —
  `features/auth/constants/password-policy.ts` duplicates
  `IsStrongPassword`'s five checks (`backend/src/validators/is-password-strong.validator.ts`)
  client-side, one predicate per `PasswordErrorCode`. This is a deliberate,
  scoped exception to the "don't duplicate password rules" principle above:
  a live-as-you-type checklist inherently needs the rules before any
  round-trip, and the alternatives considered were rejected —
  a `GET /auths/password-policy` endpoint would only centralize the
  `MIN_LENGTH` number, not what counts as "uppercase"/"special char" (still
  regex logic on the client either way), and a debounced real backend call
  per keystroke wouldn't feel live and adds server load per keystroke. The
  duplication is low-risk because it's UX-only: the backend stays the sole
  authority at submit time regardless of what the checklist shows, so a
  drifted checklist would at worst be a stale *hint*, not a security or
  correctness gap. If the two ever do drift (backend rule changes without a
  matching client update), the checklist becomes misleading but submit-time
  behavior (previous bullet) is unaffected. `features/auth/components/PasswordChecklist.tsx`
  renders it under the password field.
- On a `400 Validation failed` response (`docs/error-handling.md` envelope:
  `{ statusCode, message, errors: FieldError[] }`), each `FieldError.field`
  maps to the corresponding input, and each of its `errors[].code` is
  translated to Spanish via a small lookup table in
  `features/auth/components/RegisterForm.tsx` covering the codes the
  register form's fields can actually produce (`NAME_REQUIRED`,
  `NAME_INVALID_TYPE`, `CONTAINS_PROFANITY`, `EMAIL_REQUIRED`,
  `EMAIL_INVALID_FORMAT`, `PASSWORD_REQUIRED`, `PASSWORD_INVALID_TYPE`,
  `PASSWORD_MIN_LENGTH`, `PASSWORD_UPPERCASE`, `PASSWORD_LOWERCASE`,
  `PASSWORD_NUMBER`, `PASSWORD_SPECIAL_CHAR`, `PASSWORD_NOT_STRING`). An
  unrecognized code falls back to the backend's raw `message`. Multiple
  password rule failures render as a short bullet list under the password
  field (the backend already returns all failing rules at once, not just
  the first).
- On `409` → placed by the colliding field the backend names in `errors[]`
  (email → *"Ese correo ya está registrado."*, name → *"Ese nombre ya está en
  uso."*), or a general form message if none is named. See
  `specs/register-conflict-errors.md` (supersedes the old always-under-email
  rule).
- Success → same as login: set session user via context, redirect to `/`.

## Error handling plumbing (`lib/api/client.ts`)

Extended (not just for this feature, but this feature is the first
consumer of both):

- `get`/`post` always pass `credentials: 'include'`.
- On a non-OK response, the body is parsed as JSON (backend's error
  envelope) and thrown as `ApiError` — `{ statusCode, message, errors?:
  FieldError[] }` — instead of a bare `Error` with just the status code, so
  callers can branch on `statusCode` and read field-level `errors`. If the
  body isn't valid JSON, `ApiError` falls back to `{ statusCode, message:
  response.statusText }` with no `errors`.

## Out of scope

- `GET /auths/me` or any real session-verification endpoint — not requested,
  see "Session hydration" above for the v1 substitute.
- `POST /auths/logout` — backend gap, see dedicated section above (resolved
  2026-09-14 in `specs/auth-logout-conflict-messages.md`; out of scope for
  *this* feature's own implementation, not unresolved anymore overall).
- Password reset / "forgot password" flow.
- Social login (Google/Apple) — decorative only per mock.
- "Remember me" — decorative only, no backend concept for it.
- Route protection / redirect-if-already-logged-in on `/login` or
  `/register` — not requested; a logged-in user can still load either page
  in v1.
