# Testing handoff — security-hardening

Session: independent testing session (not the implementation session), spec
`specs/security-hardening.md`, worktree `.claude/worktrees/security-hardening`,
branch `feature/security-hardening`. Read `IMPLEMENTATION-HANDOFF.md` first,
per its own instructions. (Note: this worktree's pre-existing
`TESTING-HANDOFF.md` belongs to `user-profile`, not this feature — left
untouched.)

## Status: all 5 stages verified against spec — no bugs found

Verification was black-box, against a real running instance (`PORT=4007
pnpm start:dev`, real Postgres via `docker-compose`), not a re-read of the
implementation. Existing suites (648 unit / 235 e2e) were not re-run — the
goal here was the real-HTTP and real-browser gaps those suites don't cover,
per the task brief.

### §1 Rate limiting — verified, matches spec exactly

- `POST /auths/login` (wrong password) and `POST /auths/register` (unique
  emails): 6-request burst, 1st–5th succeed (401/201 respectively) each
  carrying `X-RateLimit-Limit: 5` / decrementing `X-RateLimit-Remaining`, 6th
  returns `429` with `Retry-After: 60`. Exactly as designed.
- Global limit boundary on `GET /fragrances`: request #100 → `200` (`X-
  RateLimit-Remaining: 0`), #101 → `429`, #102–105 stay `429`. Clean two-point
  boundary, no off-by-one.
- Requests 1–100 in that same burst were all plain `200`s — confirms normal
  (non-burst) use of another endpoint doesn't trip the global limit
  prematurely.

### §2 Security headers — verified; closed the browser-verification gap

- `curl -D -` against `/`, `/listings`, `/docs`: `X-Powered-By` absent, `CSP`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
  `Referrer-Policy: no-referrer` all present. No `Strict-Transport-Security`
  header anywhere (dev, `NODE_ENV` unset) — correct per spec.
- **Real-browser check (the gap the implementation flagged as unverified):**
  used Playwright + the machine's cached Chromium (no MCP browser tool
  available; a plain Node script works fine — see
  [[playwright-available-locally]]) to load `/docs` headlessly. Result: 0
  console messages, 0 page errors, 0 failed requests, 31 operation blocks
  rendered, and the first operation block expands on click (interactivity
  confirmed). No CSP violations under the real CSP header — the concern the
  implementation couldn't check with curl alone.

### §3 Payload size — verified, matches spec exactly

- A ~300KB JSON body to `POST /auths/register` → `413`,
  `{"statusCode":413,"message":"Payload too large",...}` — clean, not a 500.
  A normal-sized body to the same route still returns `201`.
- Batch boundary (100/101) on both `POST /vendors/batch` and
  `POST /listings/batch`: 100 items → `201` (processed, per-item
  results/partial-success semantics as designed), 101 items → `400` with
  `"items must contain no more than 100 elements"` on both endpoints.

### §4 MCP validation parity — verified, matches spec exactly

- Real MCP protocol (via `@modelcontextprotocol/sdk`'s `Client` +
  `StreamableHTTPClientTransport` against the live server, not a mocked
  unit test): `get_listings_for_fragrance` with the well-formed **v1** UUID
  `f47ac10b-58cc-1372-8567-0e02b2c3d479` → `isError: true`, `"Invalid input:
  fragranceId must be a UUID"`.
- REST equivalent, `GET /listings?fragranceId=f47ac10b-...` → `400`
  `{"field":"fragranceId","errors":[{"code":"fragranceId must be a UUID"}]}`
  via the global `ValidationPipe`. Parity confirmed on both sides.
- All 5 tools (`search_fragrances`, `get_fragrance`, `list_vendors`,
  `get_listings_for_fragrance`, `get_cheapest_listing`) called with valid
  input — no regression, all return normal (non-error) results.
- Checked `search_fragrances`/`list_vendors`'s zod schemas against
  `FindFragranceDto`/`FindVendorsDto`: neither has a UUID (or any other
  type-narrowing) field, so there's no analogous zod-vs-DTO gap to find
  there — nothing to fix, confirmed by reading both DTOs.
- Aside (not a gap, just confirmed while reading): `get_fragrance`'s zod
  `z.string().uuid()` and REST `GET /fragrances/:id`'s `ParseUUIDPipe`
  (default, unversioned — accepts any RFC4122 version) are already in
  parity with each other; the v1-UUID gap is specific to
  `FindListingsDto.fragranceId`'s `@IsUUID('4')`, as the spec says.

### §5 Markup sanitization — verified, matches spec exactly

- `POST /auths/register`: `name: "<script>alert(1)</script>"` and
  `name: "<img src=x onerror=alert(1)>"` both → `400`/`CONTAINS_MARKUP`.
  Markup in `email` → `400`/`CONTAINS_MARKUP` (plus `EMAIL_INVALID_FORMAT`,
  as expected — two independent validators both fire). Plain text
  (`"O'Brien-Smith Jr."`) → `201`, no false positive.
- **Correction to the task brief**: there is no singular `POST /fragrances`
  or `PATCH /fragrances/:id` — only `POST /fragrances/batch` and
  `PATCH /fragrances/batch` exist (confirmed from the route log; `curl`
  against the singular paths returned `404 Cannot POST /fragrances`). Ran
  the description-markup cases through the batch endpoints instead:
  - `POST /fragrances/batch` with `description: "<script>..."` → `400`,
    `items.0.description` / `CONTAINS_MARKUP`.
  - `POST /fragrances/batch` with a normal description → `201`, succeeds.
  - `POST /fragrances/batch` with `description: "Longevity rating is 5 > 3
    ..."` → `400`/`CONTAINS_MARKUP` — the documented tradeoff, confirmed
    behaving exactly as accepted in the spec, not reported as a bug.
  - `PATCH /fragrances/batch` on the created id with markup in
    `description` → `400`/`CONTAINS_MARKUP`, confirming
    `UpdateFragranceDto` really does inherit `IsNotMarkup` via
    `PartialType(CreateFragranceDto)` (not just at the type level — the
    validator actually runs on update).
  - `PATCH /fragrances/batch` with a normal updated description → succeeds.

## Gotcha hit this session (worth recording for the next one)

- **`backend/.env` is missing `JWT_SECRET`/`JWT_EXPIRES_IN`** (only
  `POSTGRES_*`/`DATABASE_URL` are in `.env.example`) — `pnpm start:dev`
  boots fine but any `/auths/register` or `/auths/login` call 500s with
  `secretOrPrivateKey must have a value` until these are set. This is the
  same gap [[user-profile-testing-findings]] already flagged. Worked around
  by exporting `JWT_SECRET`/`JWT_EXPIRES_IN` as **process env vars** before
  `pnpm start:dev` (dotenv doesn't override already-set `process.env`
  values) rather than editing `.env` — this sandbox blocks reading/writing
  `.env` files directly (only `*.example` is allowed), so that's the only
  viable path for a manually-started dev server. Also had to `pkill -9`
  several stale `backend/dist/main` node processes left running from
  *before* this session (unrelated prior process, port conflicts otherwise
  masked which instance curl was actually hitting) before starting a clean
  one.

## Incidental finding — fixed this session (out of scope for the security-hardening spec itself)

Hit only because of the `JWT_SECRET` gotcha above, not a security-hardening
regression: the **first** `POST /auths/register` attempt (before
`JWT_SECRET` was set) returned `500`, but the user row was already
committed to the database — a retry with the same email got `409 Email
already registered`. `AuthsService.register` inserted the user row, then
separately signed the JWT in `buildAuthResponse()`; if signing threw, the
client saw a bare `500` with no indication the account was actually
created. Pre-existing bug, unrelated to any of the 5 security-hardening
stages — but the user asked for it to be fixed in this same session, so it
was:

- `user.id` (the JWT's `sub`) only exists after the insert (`serial` PK), so
  the JWT literally can't be signed *before* the row exists — signing
  "then" inserting, as literally requested, isn't possible. Got the same
  atomicity guarantee instead: `AuthsService.register` now wraps the insert
  and the JWT signing in one Drizzle transaction
  (`this.db.transaction(async (tx) => {...})`); `UsersService.create` takes
  an optional `tx` handle (defaults to the pooled `db`, so every other
  caller is unaffected) so the insert runs inside that same transaction. If
  signing throws, the transaction rolls back — no orphaned row. A failure
  in the insert itself (e.g. a `23505` the optimistic `findByEmail` check
  missed) still propagates exactly as before — it was never being
  swallowed, just re-verified this stays true after the reorg.
- Verified against the real running instance: with `JWT_SECRET` unset,
  registering the same email twice now returns `500` **both** times (not
  `409` on the second) — confirmed via a direct `psql` query that no row
  exists for that email after the failure. With `JWT_SECRET` set, the
  happy path is unaffected: `201`, user body, `Set-Cookie: session=<jwt>`.
- `backend/src/auths/auths.service.ts` and
  `backend/src/users/users.service.ts` changed; both spec files updated to
  match (new transaction mock in `auths.service.spec.ts`, new
  tx-override test in `users.service.spec.ts`). Full suite: 651 passed (up
  from 648), `pnpm lint` clean. **Left uncommitted** — this session doesn't
  commit without being asked, and this change is unrelated to the
  security-hardening spec, so if it's committed it probably shouldn't be
  folded into any of the 5 existing stage commits.

## Test data created this session (left in the DB, not cleaned up)

- Admin test account: `sectest.mario.pedemonte@uc.cl` (promoted to
  `role='admin'` directly via `psql`, per the task brief's instructions —
  no seeded admin existed).
- ~100 vendors from the batch-boundary test (`Batch Boundary Vendor v100-*`
  named, ids ~2953–3052), a handful of listings against fragrance
  `fb224850-38df-418e-81b1-26eaab5c68e1` / vendor `777777`, and a handful of
  fragrances/users from the markup tests (`Markup Test Fragrance ...`,
  `Clean Fragrance ...`, `payload.*@example.com`, etc.). None of this
  affects correctness of the findings above; flagging in case a later
  session wants a clean catalog to work against.

## Do not

- Delete or remove this worktree.
- Merge or open a PR — not asked for.
- This was a testing-only session — no source files were changed, so
  `pnpm lint` wasn't run (nothing to lint).
