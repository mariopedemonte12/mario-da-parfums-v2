# Implementation handoff — security-hardening

Session: implementation session, spec `specs/security-hardening.md`, worktree
`.claude/worktrees/security-hardening`, branch `feature/security-hardening`.
Paused 2026-09-15, mid-implementation (stage 1 of 5 done). Continue in this
**same** worktree/branch — don't create a new one, this is one feature.

## Status: stage 1/5 done — rate limiting

Committed `a184586`. `@nestjs/throttler`: global 100 req/min/IP via
`APP_GUARD`, stricter 5 attempts/60s/IP on `POST /auths/login` and
`POST /auths/register`. Global limit relaxes to 100k/min under
`NODE_ENV=test` (vitest sets this automatically) so the guard stays real and
wired through e2e without tripping the existing suites' request volume.

Verified: full unit (624 tests) + e2e (235 tests) suites pass unchanged;
manual curl against a running instance confirmed the 6th login attempt in
60s returns `429` while unrelated endpoints stay unaffected. Full design
rationale in `specs/security-hardening.md` §1.

## Next: stages 2–5, in order, per `TODO.md` item 7 and `specs/security-hardening.md`

2. **Security headers** — `helmet` in `backend/src/main.ts`, before
   `app.enableCors(...)`. Minimal/disabled CSP since this is a JSON API, but
   `/docs` (Swagger, serves real HTML) needs to keep rendering — check that
   before locking in the CSP config. Confirm `X-Powered-By` is gone and HSTS
   isn't forced in dev (`hsts: process.env.NODE_ENV === 'production'` if needed).
3. **Payload size** — explicit body-size limit (`express.json({ limit })` /
   `express.urlencoded(...)` after `NestFactory.create(AppModule, { bodyParser: false })`),
   fix `AllExceptionsFilter` (`backend/src/common/filters/http-exception.filter.ts`)
   to turn body-parser's `PayloadTooLargeError` into a real `413` instead of
   falling into the generic 500 branch, and add `@ArrayMaxSize(...)` to the
   batch DTOs that lack it (`backend/src/vendors/dto/batch-create-vendors.dto.ts`,
   `backend/src/listings/dto/batch-create-listings.dto.ts`, and their
   update/delete counterparts).
4. **MCP validation parity** — `backend/src/mcp/tools/register-catalog-tools.ts`
   builds DTOs with `Object.assign`, skipping `class-validator`. Needs an
   explicit design call *in the spec* before coding: zod-schema enrichment
   vs. reusing `class-validator`'s standalone `validate()`. Extend
   `register-catalog-tools.spec.ts` to prove a DTO-only-invalid input (not
   just zod-invalid) is rejected via MCP like it is via HTTP.
5. **HTML sanitization** — new validator in `backend/src/validators/`
   (same pattern as `is-not-profane.validator.ts`), rejecting markup in
   `name`/`email` (`RegisterDto`, `AdminCreateUserDto`, `UpdateUserDto`) and
   `description` (`CreateFragranceDto`/`UpdateFragranceDto`). Decide
   reject-vs-strip in the spec (reject is more consistent with
   `IsNotProfane`'s existing behavior). Cover with a test: `<script>`/
   `<img onerror=...>` → `400`, not `201`.

After each stage: `pnpm lint`, `pnpm test` (+ `pnpm test:e2e` where the
change could affect it, like stage 1's did), commit separately, update
`specs/security-hardening.md`'s §2–5 placeholder with what was actually
decided/built.

## Gotchas hit this pass (so they aren't re-discovered)

- **`TESTING-HANDOFF.md` at this worktree's root is not this feature's.**
  It's `user-profile`'s testing handoff doc, committed on that branch and
  merged into `master` before this worktree was created — `master` had
  advanced past the conversation's stale start-of-session snapshot (4 more
  merged PRs: user-profile, auth-logout-conflict-messages,
  fragrance-catalog, fragrance-detail) by the time `feature/security-hardening`
  branched off it. Leave it alone; this feature's own eventual testing
  handoff should use a different name or be clearly scoped so it doesn't
  read as a continuation of that unrelated doc.
- `@nestjs/throttler@^6.5.0`'s peer-dep range caps at `@nestjs/common@^11`,
  one major behind this repo's `@nestjs/common@12.0.1`. Installs fine (pnpm
  doesn't enforce strict peer deps here) — don't re-investigate this as a
  new problem, it's expected and documented in `specs/security-hardening.md`.
- `process.env.NODE_ENV` is `'test'` automatically under both
  `vitest run` and `vitest run --config vitest.config.e2e.ts` — no test
  config changes were needed to detect the test environment for stage 1's
  relaxed throttle limit; the same trick is available for any future
  env-conditional behavior.

## Do not

- Delete or remove this worktree — implementation isn't finished, and once
  it is, a **separate** testing session still needs it (per root `CLAUDE.md`).
- Test-and-implement in the same session for any of stages 2–5.
- Merge/open a PR without being explicitly asked.
