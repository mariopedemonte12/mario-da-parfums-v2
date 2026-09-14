# Auth: accurate conflict messages + real logout

Two small, related backend fixes to `auths`, found during the `user-profile`
testing session and already flagged as known gaps in `specs/auth-pages.md`
and `backend/src/auths/NOTES.md`.

## 1. Unique-constraint conflict message is misleading

`users` has **two** independent unique constraints: `users_name_unique` and
`users_email_unique`. `AuthsService.register` and `AuthsService.adminCreate`
both catch Postgres `23505` (unique violation) from `usersService.create(...)`
and unconditionally throw `ConflictException('Email already registered')` —
even when the actual collision was on `name`, not `email`.

### Behavior

- On a `23505` from `usersService.create(...)` in `register`/`adminCreate`,
  inspect the violated constraint name (available on the underlying pg
  error's `.constraint`, same place `getPgErrorCode` already reaches via
  `.cause` for drizzle-wrapped errors) and throw a message that names the
  field that actually collided:
  - `users_email_unique` → `'Email already registered'` (unchanged).
  - `users_name_unique` → `'Name already taken'`.
  - Anything else (defensive fallback — a constraint name changes, or a
    future column adds a unique index) → keep today's generic message,
    `'A user with that name or email already exists'` (same wording
    `UsersService.update` already uses for its own 23505 catch), so an
    unrecognized constraint never surfaces a wrong but confident field name.
- Applies to both `register` (public) and `adminCreate` (admin-only) — both
  share the identical insert-then-catch shape.
- The existing optimistic `findByEmail` pre-check ahead of the insert is
  unchanged; it still only pre-checks email, not name (documented as
  intentional in `auths/NOTES.md`) — this fix only changes what happens once
  Postgres itself rejects the insert.

### Out of scope

- `frontend/.../RegisterForm.tsx` always renders **any** 409 from
  `POST /auths/register` under the email field
  (`"Ese correo ya está registrado."`), regardless of the response body.
  With this fix, a name collision now returns an accurate backend message,
  but the frontend still shows it under the wrong field — a pre-existing,
  already-documented frontend gap (`specs/auth-pages.md`,
  `auths/NOTES.md`). Not touched here: this task is backend-only.
- `UsersService.update`'s own 23505 handling (profile edits) — untouched,
  already generic and out of scope.

## 2. `POST /auths/logout` doesn't exist

The session credential is an httpOnly cookie (`SESSION_COOKIE_NAME`,
`auths/constants.ts`), so the frontend cannot clear it itself. `useAuth()`'s
`logout()` already calls `POST /auths/logout` (`frontend/.../auth.api.ts`)
and clears local state regardless of the call's outcome — today that call
404s, so "logout" only ever clears client-side state and the cookie stays
valid server-side. This is the gap `specs/auth-pages.md` ("`POST
/auths/logout` does not exist") and `auths/NOTES.md` call out as blocking.

### Behavior

- Add `POST /auths/logout` to `AuthsController`. No guard — logout is
  idempotent whether or not the caller currently holds a valid/any session
  cookie.
- Clears the session cookie by issuing an expired `Set-Cookie` for
  `SESSION_COOKIE_NAME`, using the **same** `httpOnly`/`sameSite`/`secure`
  attributes `setSessionCookie` sets it with (a `clearCookie` call whose
  attributes don't match the original `Set-Cookie` won't actually delete it
  in the browser).
- Responds `204 No Content` — nothing to return, and the frontend's
  `logout()` already discards the response body (`Promise<void>`).
- No service-layer change: this is a pure HTTP/cookie concern with no
  business logic or DB access, same reasoning that already keeps
  `setSessionCookie` in the controller rather than `AuthsService`.

### Out of scope

- No server-side token revocation/blacklist. JWTs stay stateless; logout
  only clears the cookie the browser holds. A token copied elsewhere (e.g.
  sent manually via `Authorization: Bearer`) remains valid until it expires
  on its own. `specs/auth-pages.md` never asked for real revocation either.
- No new frontend work — `useAuth().logout()` and the "Salir" button
  already call this endpoint; today's known-gap caveats in
  `specs/auth-pages.md` about logout not being "real" become resolved by
  this endpoint shipping, but re-verifying that is for the testing session.
