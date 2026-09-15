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
2. **Security headers (`helmet`)** — done, this pass.
3. Payload size limits (body size + 413 handling + batch `@ArrayMaxSize`) — not started.
4. MCP tool input validation parity with HTTP DTOs — not started.
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

## 3–5. Not yet implemented

See `TODO.md` item 7 (points 3–5) for the findings and planned design of
payload size limits, MCP validation parity, and HTML sanitization. This
section will be filled in with the actual design decisions as each is
implemented, in a later session against this same worktree/branch
(`feature/security-hardening`).

## Out of scope (all points)

- Anything not listed in `TODO.md` item 7 — this spec doesn't expand the
  audit's scope.
- Testing/verifying these fixes beyond the implementer's own sanity checks
  (lint, existing test suites, targeted manual curl) — real verification is
  a separate testing session per root `CLAUDE.md`.
