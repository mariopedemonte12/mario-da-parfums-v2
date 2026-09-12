# `common` — notes

## Filters

`AllExceptionsFilter` (`filters/http-exception.filter.ts`) is one of the two pieces of the global error-handling system — see `docs/error-handling.md` for the full design; this note is implementation-specific detail that doc doesn't spell out:

- `errors` is added to the response payload only via conditional spread (`...(errors ? { errors } : {})`) — never sent as `errors: []` or `errors: undefined`, so the response shape never implies field-level detail exists when it doesn't.
- An `HttpException`'s body can be a `string` or an object; both are handled, because Nest's built-in exceptions (`new ConflictException('...')`) return a string while `customValidationPipe` returns `{ message, errors }`.
- The unknown-exception branch never forwards `exception.message`/`stack` to the client — deliberate, to avoid leaking DB driver internals (column names, connection string fragments). Covered explicitly by `http-exception.filter.spec.ts`.
- **Test strategy**: the spec instantiates `AllExceptionsFilter` directly with a hand-built minimal `ArgumentsHost` (mocking only `switchToHttp().getResponse()`) instead of going through Nest's `TestingModule` — simplest way to test an `ExceptionFilter` without a real HTTP server.

## Guards

Chain order matters: `JwtAuthGuard` must run first and populate `request.user` (typed `AuthenticatedRequest`) — `ResourceOwnerGuard` and `RolesGuard` both assume it already ran.

- **`JwtAuthGuard`**: two distinct 401 messages (`'Missing authentication token'` vs `'Invalid or expired token'`) — unlike login, there's no user-enumeration risk here, so no need to genericize.
- **`ResourceOwnerGuard`**: compares `request.user.sub` (number, from the JWT) against `request.params[paramName]` (always a string from Express) — casts `sub` to `String(...)` before comparing, otherwise the comparison is always `number !== string` and fails even when they match. Does **not** replace `RolesGuard`: an admin who needs cross-user access still needs role logic combined separately (see `users.controller.ts`). The route param name defaults to `'id'` unless overridden with `@OwnerParam('paramName')` (`decorators/owner-param.decorator.ts`).
- **`RolesGuard`**: no `@Roles(...)` declared on an endpoint → guard is a no-op and lets the request through. This is what makes it safe to register globally/at controller level without turning every endpoint admin-only — only endpoints that explicitly opt in with `@Roles(...)` get restricted.
- **`SelfOrAdminGuard`**: the "cross-user access for admins" combination `ResourceOwnerGuard`'s note above points to — Nest evaluates the guards on a route with AND, so `@UseGuards(RolesGuard, ResourceOwnerGuard)` can't express "owner OR admin"; this guard checks `request.user.role === Role.ADMIN` first and falls back to the same owner-param comparison `ResourceOwnerGuard` does otherwise. Used by `users.controller.ts` on `GET/PATCH /users/:id`.
