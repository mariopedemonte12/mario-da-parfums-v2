# register-conflict-errors

Fixes the register form attributing every `409` to the email field.
Supersedes the "frontend still shows it under the wrong field" gap noted in
`specs/auth-logout-conflict-messages.md`, `specs/auth-pages.md` ("/register")
and `backend/src/auths/NOTES.md`.

## Problem

`users` has two independent unique constraints (`users_name_unique`,
`users_email_unique`). Before this change the `409` body only carried an
English `message` (`Email already registered` / `Name already taken` /
generic), and `RegisterForm` ignored it and always rendered
"Ese correo ya está registrado." under the email input.

## Behavior

### Backend (contract addition, backwards compatible)

A `409` caused by a user unique violation now includes the same `errors`
envelope the validation `400`s use (`backend/docs/error-handling.md`):

| Collision | `message` (unchanged) | `errors` |
|---|---|---|
| email (optimistic `findByEmail` pre-check, or `users_email_unique`) | `Email already registered` | `[{ field: "email", errors: [{ code: "EMAIL_ALREADY_REGISTERED" }] }]` |
| name (`users_name_unique`) | `Name already taken` | `[{ field: "name", errors: [{ code: "NAME_ALREADY_TAKEN" }] }]` |
| any other unique constraint | `A user with that name or email already exists` | absent |

- Both codes are new entries in `ValidationErrorCode` (the existing catalog).
- `statusCode` and `message` are unchanged, so clients that ignore `errors`
  keep working.
- Applies to `POST /auths/register`, `POST /auths/admin-register`, and
  `PATCH /users/:id` (same 23505 mapping; before, update always returned the
  generic message).

### Frontend (`/register`)

- `409` with `errors` for `email` -> "Ese correo ya está registrado." under
  the email field.
- `409` with `errors` for `name` -> "Ese nombre ya está en uso." under the
  name field.
- `409` with neither (unknown constraint / old backend) -> general form
  message "No pudimos crear la cuenta: ya existe un usuario con esos datos.",
  not attributed to any field.
- Errors from a previous submit are cleared on each submit (unchanged).

## Out of scope

- `/login` has no 409 path. `/profile` is read-only in this UI (no edit form),
  so it has no equivalent mapping to fix.
- Pre-checking `name` uniqueness before the insert (still only caught by the
  db constraint).
