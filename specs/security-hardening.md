# Backend security hardening

## Purpose

Five fixes for findings confirmed dynamically during an end-to-end security
audit of `backend/` (skill `security-audit`, session of 2026-09-14, against
an isolated Postgres instance — the shared dev DB used by other worktrees was
never touched by the audit itself). Full findings context: that audit
session's report, and `TODO.md` item 7 at the repo root.

This is an implementation-only spec. Verification of these fixes is a
**separate testing session**, per this repo's implementation/testing split
(root `CLAUDE.md`) — do not test-and-implement in the same session.

Being implemented in stages (own commits), tracked here as each lands:

1. **Rate limiting** — done.
2. **Security headers (`helmet`)** — done.
3. **Payload size limits (body size + 413 handling + batch `@ArrayMaxSize`)** — done.
4. **MCP tool input validation parity with HTTP DTOs** — done, this pass.
5. HTML/markup sanitization on free-text fields — not started.

## 1. Rate limiting

### Finding

No rate limiting existed anywhere in the API. Confirmed dynamically: 20
consecutive failed `POST /auths/login` attempts, no `429`, no backoff.
`@nestjs/throttler` (or any rate-limiting library) was absent from
`backend/package.json`.

### Design

- **Library**: `@nestjs/throttler@^6.5.0`. Its published peer-dep range caps
  at `@nestjs/common@^11`, one major behind this repo's `@nestjs/common@12.0.1`
  (NestJS 12 is newer than the library's last peer-dep bump) — pnpm installs
  it without error (no strict-peer-dependencies enforcement in this repo's
  pnpm config) and the guard/decorator/module API this pass uses (`ThrottlerModule.forRoot`,
  `APP_GUARD` + `ThrottlerGuard`, `@Throttle()`) is stable NestJS-8-through-12
  surface, unaffected by the Nest 12 changes the peer range hasn't caught up
  to yet. Revisit only if a future `@nestjs/throttler` major actually breaks
  against a later Nest core bump.
- **Global limit**: `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])`
  registered in `app.module.ts`, applied everywhere via
  `{ provide: APP_GUARD, useClass: ThrottlerGuard }`. 100 req/min/IP is a
  generic ceiling against blunt scripted abuse, not tuned per-endpoint.
- **Stricter per-route limit**: `POST /auths/login` and `POST /auths/register`
  (`backend/src/auths/auths.controller.ts`) — the brute-forceable endpoints —
  additionally carry `@Throttle({ default: { limit: 5, ttl: 60_000 } })`,
  i.e. 5 attempts/60s/IP. `@Throttle()` on a route overrides the global
  `default` policy for that route rather than stacking with it.
- **Test environment**: e2e specs (`backend/test/*.e2e-spec.ts`) boot
  `AppModule` directly via `Test.createTestingModule` (no provider
  overriding), so the global `ThrottlerGuard` applies to them exactly as it
  does in production — and a single e2e file can issue far more than 100
  requests from the same IP (supertest's local client) well inside a 60s
  window, which would trip the global limit and fail unrelated tests.
  Confirmed `process.env.NODE_ENV` is `'test'` under both `vitest run` and
  `vitest run --config vitest.config.e2e.ts` (vitest sets it automatically,
  nothing test-specific needed in this repo's config) — `app.module.ts`
  branches the global limit on that: **`limit: 100` normally, `limit: 100_000`
  when `NODE_ENV === 'test'`**, same `ttl`. This keeps the guard wired and
  exercised (a real `ThrottlerGuard` runs in e2e, not a mock/no-op) while
  making it a practical no-op against the existing suites' request volumes.
  The route-level `@Throttle()` on login/register is **not** relaxed for
  test — nothing in the existing e2e suites hits `/auths/login` or
  `/auths/register` repeatedly, and leaving it real means a dedicated
  throttling e2e test (out of scope this pass) could be added later without
  touching this config again.
- **Not addressed this pass**: `trust proxy` / `X-Forwarded-For` handling —
  `ThrottlerGuard` keys on `req.ip`, which is only meaningful as a per-client
  key when the app isn't behind a reverse proxy stripping/rewriting that
  header, or is explicitly configured to trust it. No reverse proxy exists in
  front of this backend yet; revisit when one is introduced (e.g. at deploy
  time) since otherwise every request could appear to share one IP and share
  one throttle bucket.

### Verification done this pass

- Full unit (`pnpm test`) and e2e (`pnpm test:e2e`) suites pass unchanged
  with the guard wired globally.
- Manual `curl` against a running instance (local Postgres via
  `docker-compose.yml`): 6th `POST /auths/login` within 60s from the same
  client returns `429 Too Many Requests`; unrelated endpoints stay usable
  well past 5 requests, consistent with the global 100/min ceiling.

## 2. Security headers

### Finding

`curl -D -` against several endpoints showed only `X-Powered-By: Express` —
no CSP, `X-Content-Type-Options`, `X-Frame-Options`, HSTS, or
`Referrer-Policy` anywhere in the API.

### Design

- **Library**: `helmet@^8.3.0`, applied via `app.use(helmet({...}))` in
  `backend/src/main.ts`, before `app.enableCors(...)`.
- **CSP**: this is a JSON API with exactly one HTML surface, Swagger UI at
  `/docs` (`SwaggerModule.setup`). A blanket `default-src 'none'` would break
  it, so the directive set is helmet's own defaults
  (`helmet.contentSecurityPolicy.getDefaultDirectives()`) with `default-src`
  narrowed to `'self'` — no `'unsafe-inline'`/`'unsafe-eval'` added anywhere.
  Verified this is sufficient: `/docs`'s generated HTML loads
  `swagger-ui-bundle.js`, `swagger-ui-standalone-preset.js`, and
  `swagger-ui-init.js` as same-origin `<script src="./docs/...">` tags (no
  inline `<script>`), and `swagger-ui.css` as a same-origin stylesheet — all
  satisfied by `script-src 'self'` / `style-src 'self' https: 'unsafe-inline'`
  (the latter `'unsafe-inline'` is a helmet default, not something added for
  Swagger). Confirmed against a running instance: `/docs` and its
  `/docs/swagger-ui-*` assets all return `200` with the CSP header present,
  and the page's own script tags are all same-origin.
- **HSTS**: `hsts: process.env.NODE_ENV === 'production'` — forcing it in dev
  would push plain-HTTP `localhost` into a browser's HSTS cache as
  HTTPS-only. Confirmed via curl against a dev instance (`NODE_ENV`
  unset) that no `Strict-Transport-Security` header is sent.
- **`X-Powered-By`**: helmet removes it by default; confirmed via curl that
  it's absent from every response after the change (present before).
- Everything else uses helmet's defaults (`X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`,
  `Cross-Origin-Opener-Policy`, etc.) — no per-app override needed for a pure
  JSON API plus one same-origin-only HTML page.

### Verification done this pass

- Full unit (`pnpm test`, 624) and e2e (`pnpm test:e2e`, 235) suites pass
  unchanged. Note: the e2e suites boot `AppModule` via
  `Test.createTestingModule` directly (per stage 1's note), not through
  `main.ts`'s `bootstrap()`, so they don't exercise `helmet()` itself —
  header behavior was verified manually instead (below), consistent with how
  stage 1 verified the throttler's live behavior.
- Manual `curl -D -` against a running dev instance: `X-Powered-By` gone,
  CSP header present on both `/docs` and a JSON endpoint
  (`GET /fragrances?limit=1`), no `Strict-Transport-Security` header in dev,
  `/docs` and all three `/docs/swagger-ui-*.js` assets (+ `.css`) return
  `200`.

## 3. Payload size limits

### Finding

A body over the accidental Express/body-parser default of 100kb threw a
generic `500` instead of a `413` — `PayloadTooLargeError` isn't a Nest
`HttpException`, so `AllExceptionsFilter` fell into its generic
unknown-error branch (`backend/src/common/filters/http-exception.filter.ts`).
Additionally, batch endpoints (`vendors`/`listings` create/update/delete) had
no cap on array length beyond the (now-explicit) body size itself.

### Design

- **Explicit body-size cap**: `NestFactory.create(AppModule, { bodyParser:
  false })` + `app.use(json({ limit: '256kb' }))` /
  `app.use(urlencoded({ limit: '256kb', extended: true }))` in
  `backend/src/main.ts`, replacing the implicit 100kb default with an
  intentional, documented one. `256kb` was sized against the largest
  legitimate payload today: a 100-item batch (the new `@ArrayMaxSize(100)`
  cap below) of `CreateListingDto` at its longest fields (500-char `url`) is
  ~70KB — `256kb` leaves headroom for JSON escaping/multi-byte content
  without opening the door to multi-MB bodies. `express` was added as an
  explicit dependency (previously only `@types/express` was declared,
  pulled in transitively via `@nestjs/platform-express`) since `json`/
  `urlencoded` are needed as runtime values, not just types.
- **Middleware order**: `helmet()` is registered **before** the body-size
  middleware. When `json()`/`urlencoded()` reject an oversized body, Express
  routes the error straight to the exception filter, skipping any
  *remaining* regular middleware in the chain — if helmet ran after, a
  rejected request would ship without helmet's headers (confirmed this
  concretely: `X-Powered-By: Express` leaked on the `413` response until
  helmet was moved first).
- **`AllExceptionsFilter` fix**: body-parser's oversized-body error (thrown
  via `raw-body`/`http-errors`) is a plain `Error`, not an `HttpException`,
  but carries `type: 'entity.too.large'`. Added an `isPayloadTooLargeError()`
  check ahead of the `HttpException` branch that maps it to a real
  `HttpStatus.PAYLOAD_TOO_LARGE` (413) with a clean `'Payload too large'`
  message instead of leaking into the generic 500 path. Covered by a new
  unit test in `http-exception.filter.spec.ts`.
- **Batch array cap**: `@ArrayMaxSize(100)` added alongside the existing
  `@ArrayMinSize(1)` on all six vendors/listings batch DTOs
  (`batch-create-vendors.dto.ts`, `batch-update-vendors.dto.ts`,
  `batch-delete-vendors.dto.ts`, `batch-create-listings.dto.ts`,
  `batch-update-listings.dto.ts`, `batch-delete-listings.dto.ts`). `100` was
  chosen to match this codebase's existing pagination `MAX_LIMIT`
  convention (`find-fragrance.dto.ts`, `find-favorites.dto.ts`,
  `find-listings.dto.ts`, `find-users.dto.ts`, `find-vendors.dto.ts` all cap
  `limit` at 100) rather than inventing a new number. Added
  boundary-pair tests (100 accepted / 101 rejected) to the three listings
  batch DTO spec files, which already had `class-validator`-based DTO tests
  in this exact style; vendors batch DTOs had no pre-existing spec files to
  extend, so none were added net-new for this pass (the identical decorator,
  used identically, is exercised by the listings tests).
- **Deliberately not touched**: `CreateFragranceDto`/`UpdateFragranceDto`'s
  `description` field has no `@MaxLen` at all (unlike every other free-text
  field in this codebase), and fragrances' own batch DTOs
  (`create-fragrance-batch.dto.ts`, `update-fragrance-batch.dto.ts`,
  `delete-fragrance-batch.dto.ts`) have no `@ArrayMaxSize` either — same gap
  shape as the vendors/listings ones just fixed. Out of scope here because
  `TODO.md` item 7 names only the vendors/listings batch DTOs explicitly;
  the body-size cap still bounds worst case exposure in the meantime, just
  less precisely than an explicit per-field/per-array limit would.

### Verification done this pass

- Full unit (`pnpm test`, 631 — up from 624: 1 new filter test + 6 new
  boundary tests) and e2e (`pnpm test:e2e`, 235) suites pass unchanged.
- Manual verification against a running instance: a >256kb JSON body to
  `POST /fragrances` returns `413` with `{"statusCode":413,"message":"Payload
  too large",...}` and the full helmet header set (including no
  `X-Powered-By`); normal-sized requests to `GET /fragrances` and `/docs`
  (plus its `swagger-ui-bundle.js` asset) still return `200` unaffected.

## 4. MCP tool input validation parity

### Finding

`backend/src/mcp/tools/register-catalog-tools.ts` built DTOs with
`Object.assign(new FindFragranceDto(), args)` (and the same for
`FindVendorsDto`/`FindListingsDto`), which never runs `class-validator`'s
decorators — only the tool's zod `inputSchema` did. Not exploitable today
(Drizzle parametrizes the query either way), but an inconsistency: the same
DTO's rules apply via HTTP (through the global `ValidationPipe`) but not via
MCP.

### Design

Chose **option (b)** from the two the finding laid out: reuse the DTOs'
own `class-validator` rules via the library's standalone `validate()`,
rather than hand-enriching the zod schemas to duplicate those rules.
Rationale: single source of truth (a DTO rule added later — e.g. a future
`@MaxLen` — applies to MCP automatically, no separate zod edit to remember),
and it fits `specs/backend-mcp-server.md`'s existing decision that the
*wire* schema stays zod/JSON-schema, not `class-validator`-bound — this adds
an internal safety-net layer without changing what's advertised to the LLM
client.

- **New helper** `backend/src/mcp/tools/validate-dto-input.ts`
  (`validateDtoInput(cls, args)`): `plainToInstance(cls, args)` +
  `validate()`; on success returns the validated/transformed instance, on
  failure returns a ready-made `errorResult(...)` (error codes from
  `parseConstraintMessage`, the same helper `customValidationPipe` uses —
  see its own comment: "shared by ... any service that validates DTO
  instances outside the global pipe").
- **Applied to** the three tools that build a DTO from raw, still-untrusted
  `args`: `search_fragrances` (`FindFragranceDto`), `list_vendors`
  (`FindVendorsDto`), `get_listings_for_fragrance` (`FindListingsDto`).
  **Not applied to** `get_cheapest_listing`: it builds its `FindListingsDto`
  from an already-schema-validated `fragranceId` plus internal constants
  (`inStock: true`, a fixed scan limit) — no raw user input reaches
  `Object.assign` there, so there's nothing for the extra layer to catch.
- **Concrete gap this closes** (used as the test case, not just a
  theoretical inconsistency): zod's `.uuid()` accepts any RFC4122 UUID
  version, but `FindListingsDto.fragranceId`'s `@IsUUID('4')` only accepts
  v4. A well-formed **v1** UUID (`f47ac10b-58cc-1372-8567-0e02b2c3d479`)
  passes `get_listings_for_fragrance`'s zod schema but is now rejected by
  the DTO layer — verified both that it fails post-fix and that it would
  have reached the service pre-fix (confirmed `isUUID(v1, '4')` returns
  `false` and `.uuid().safeParse(v1)` returns `true` directly against the
  installed `zod`/`class-validator` versions before writing the test).
- `backend/src/mcp/NOTES.md` updated to record the two-layer validation
  design and why `get_cheapest_listing` is the deliberate exception.

### Verification done this pass

- Full unit (`pnpm test`, 632 — 1 new MCP test) and e2e (`pnpm test:e2e`,
  235) suites pass unchanged.
- Extended `register-catalog-tools.spec.ts` with the v1-UUID case above:
  `get_listings_for_fragrance` returns `isError: true` and never calls
  `listingsService.findAll` for that input — the exact "DTO-only-invalid
  input rejected via MCP like it is via HTTP" proof the finding asked for
  (the same DTO is applied to the equivalent REST query param through the
  global `ValidationPipe`).

## 5. Not yet implemented

See `TODO.md` item 7 (point 5) for the finding and planned design of HTML
sanitization. This section will be filled in with the actual design
decisions once implemented, in a later session against this same
worktree/branch (`feature/security-hardening`).

## Out of scope (all points)

- Anything not listed in `TODO.md` item 7 — this spec doesn't expand the
  audit's scope.
- Testing/verifying these fixes beyond the implementer's own sanity checks
  (lint, existing test suites, targeted manual curl) — real verification is
  a separate testing session per root `CLAUDE.md`.
