# user-profile

Route `/profile` (artboard **1g** in `frontend/designGuidelines/Mario da Parfums.dc.html`). Shows the logged-in user's own data and their saved (favorite) fragrances.

## Scope (v1)

Shown, backed by real data:

- User identity: name, member-since date (`createdAt`), email.
- Saved fragrances ("Guardados"): the caller's favorites, each showing the fragrance's name/brand/olfactory family.

**Explicitly cut for v1** (per `frontend/FASE1.md`, already agreed before this feature started — not a decision made here):

- **"Estela" / olfactory-affinity percentages** (mock's "cedro 82%", "bergamota 64%", etc.) — there are no structured fragrance notes anywhere in the project to compute this from. Not simulated.
- **"Pedidos entregados" / "perfume más buscado"** stat tiles — no orders module, no search-tracking. Not simulated.
- The mock's left-sidebar section nav ("Perfil olfativo", "Pedidos", "Guardados", "Conversaciones con el sensei", "Cuenta") is not implemented as navigation — every one of those sections either doesn't exist yet (Pedidos, Conversaciones, Cuenta are separate, unbuilt features) or is cut above (Perfil olfativo/estela). `/profile` is a single view: identity block + Guardados. No tabs are rendered so there's nothing that looks clickable but silently does nothing.
- Favorites are shown as a single page (`GET /favorites?page=1&limit=20`); if `total` exceeds what's returned, the UI shows a "+N más" count instead of paginating — there's no `/favorites` route to link a "ver todos" affordance to yet.

## Contracts consumed

- `GET /users/:id` — `id: number` (own user id, not uuid). Guard is self-or-admin: 401 if the session cookie is missing/invalid, 403 if `id` isn't the caller's own id (not reachable from this UI, since `id` is always read from the caller's own session — see below). Response body is `UserResponseDto` (`backend/src/users/dto/response-user.dto.ts`): `{ id, name, email, role, photoS3Key, createdAt }`.
- `GET /favorites` — no params identify the user; the backend resolves it from the session. Query: `page`, `limit`. Response is `PaginatedFavoriteDto` (`backend/src/favorites/dto/paginated-favorite.dto.ts`): `{ data: ResponseFavoriteDto[], total, page, limit }`, where each `ResponseFavoriteDto` is `{ id, fragrance: ResponseFragranceDto, createdAt }`.

## Authentication: cookie, not header (assumption — reconcile at merge)

The backend is migrating from returning `accessToken` in the login/register response body to an **httpOnly, `SameSite=Lax` cookie**, in a separate branch not merged as of this writing. `backend/src/common/guards/jwt-auth.guard.ts` at the time this spec was written **still reads `Authorization: Bearer`**, i.e. the actual backend in this worktree has not cut over yet. This feature is built **against the future cookie contract**, per explicit instruction, not against what `jwt-auth.guard.ts` does today:

- No `Authorization` header is ever set by this feature's fetches. There is no client-readable token to put in one.
- Every fetch to `/users/:id` and `/favorites` needs `credentials: 'include'` so the browser attaches the cookie cross-origin. `lib/api/client.ts`'s `get` and `post` were extended to always pass `credentials: 'include'` (see "Shared-file merge risk" below).
- The `id` passed to `GET /users/:id` is the caller's own id from the `user` object exposed by `useAuth()` (populated at login/register time), never derived from a token — there isn't one to decode client-side.
- Any 401 from either endpoint is treated as "session ended": `useAuth()`'s `logout()` is called to clear local state, and the page redirects to `/login` — no generic network-error UI is shown for a 401 specifically.

### `useAuth.tsx` — assumed shape (reconcile with `auth-pages`)

`features/auth/hooks/useAuth.tsx` was empty when this feature started; `auth-pages` (a parallel worktree) owns completing it for real. Since this feature needs a working `user`/`logout` to build and self-test against, a **minimal implementation was written here** rather than left as a stub, per the agreed assumption:

```ts
type AuthContextValue = {
  user: User | null;   // { id, name, email } — no token, ever
  login: (params: LoginParams) => Promise<User>;
  register: (params: RegisterParams) => Promise<User>;
  logout: () => void;
};
```

- `user` is populated only by calling `login()`/`register()` in this session (from the body of `POST /auths/login` / `POST /auths/register`, read as `{ user }`, ignoring any `accessToken` field the pre-migration backend still includes). There is **no rehydration on page reload** — no "whoami"/"me" endpoint exists to re-derive `user` from the cookie after a hard refresh. Concretely: a user who reloads `/profile` will see `user === null` and get redirected to `/login` even though their cookie is still valid, until such an endpoint exists. This is a known, accepted gap for v1, not something this feature works around.
- `logout()` only clears local React state — there's no `POST /auths/logout` endpoint yet to ask the backend to clear the cookie, so a "logged out" client can still hold a live cookie until it expires. Also a known gap.
- **Whoever merges second between this branch and `auth-pages` needs to reconcile `useAuth.tsx` by hand** — both branches touch this exact file for the exact same purpose. This spec exists so that reconciliation keeps the `{ user, login, register, logout }` shape (matching what was agreed for `/profile` to consume) rather than picking one side blind.
- Also touched, for the same reason: `features/auth/types/user.types.ts` (renamed `user` → `User`, per the rename `frontend/CLAUDE.md` already calls out as owed the next time this file is touched) and `features/auth/api/auth.api.ts` (added `login()`, calling `POST /auths/login`; fixed `register()`'s endpoint from `/auth/register` to `/auths/register` — the existing path was a 404 against the actual `AuthsController`, unrelated to the cookie migration).

### Shared-file merge risk: `lib/api/client.ts`

`auth-pages` is expected to touch this same file (its `login`/`register` calls need `credentials: 'include'` too, for the `Set-Cookie` to be honored). Both `get` and `post` on the client returned by `createApiClient` now always send `credentials: 'include'`; failed responses throw a new exported `ApiError` (`{ status, message }`) instead of a plain `Error`, so callers can branch on `error.status === 401` without parsing a message string. If `auth-pages` also modifies this file, reconcile on keeping both: `credentials: 'include'` on every method, and the `ApiError` class (this feature's session-expiry handling depends on it).

## Edge cases

- **No favorites yet**: Guardados section renders an empty-state message (in the site's voice), not an empty grid.
- **`GET /users/:id` or `GET /favorites` returns 401**: treated as session-expired — `logout()` + redirect to `/login`, not a generic error banner.
- **Any other error** (network failure, 500, etc.): a generic "no se pudo cargar tu perfil" message, no redirect.
- **`user` is `null` when `/profile` mounts** (no session in this tab, e.g. never logged in or a hard refresh — see rehydration gap above): redirect straight to `/login` without calling either endpoint.
- **`photoS3Key` is `null`** (always, today — no upload flow exists): the avatar is always the diagonal-stripe placeholder used elsewhere for missing photography, never a broken `<img>`.

- **The session switches from user A to user B without `/profile` unmounting**: A's profile and favorites are never shown to B — the page shows the loading state until B's own data arrives.
- **Successful response with no body** (e.g. `204`): the API client resolves with an empty result instead of failing to parse it.

## Out of scope

- Editing profile fields (`PATCH /users/:id` exists on the backend but nothing here calls it).
- Any admin view of another user's profile (`SelfOrAdminGuard`'s admin branch is unused by this UI).
- `/login`, `/register` pages and real `useAuth` completion — `auth-pages`.
- Pagination UI / a dedicated favorites listing route.
