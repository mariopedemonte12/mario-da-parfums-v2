# Implementation handoff — security-hardening

Session: implementation session, spec `specs/security-hardening.md`, worktree
`.claude/worktrees/security-hardening`, branch `feature/security-hardening`.

## Status: 5/5 done — implementation complete

All five stages from `TODO.md` item 7 are implemented, each its own commit
on `feature/security-hardening`:

1. `a184586` — rate limiting (`@nestjs/throttler`, global + per-route on
   login/register).
2. `81dea7f` — security headers (`helmet`, CSP scoped to `default-src
   'self'`, HSTS gated on `NODE_ENV=production`).
3. `e515fb3` — explicit body size limit (256kb, replacing the accidental
   100kb default), `AllExceptionsFilter` now maps body-parser's
   oversized-body error to a real `413`, `@ArrayMaxSize(100)` on the six
   vendors/listings batch DTOs.
4. `56f7772` — MCP catalog tools now run the same `class-validator` DTOs
   HTTP uses (via a new `validateDtoInput` helper) before calling their
   services, closing the gap where `Object.assign` skipped validation
   entirely.
5. `5d4bc69` — new `IsNotMarkup` validator rejects `<`/`>` in
   `name`/`email` (`RegisterDto`, `AdminCreateUserDto`, `UpdateUserDto`) and
   `description` (`CreateFragranceDto`/`UpdateFragranceDto`).

Full design rationale, verification notes, and what was deliberately left
out of scope for each stage: `specs/security-hardening.md` (§1–§5, each
filled in as its stage landed).

## Verified this pass

- `pnpm lint`, `pnpm test` (648 unit tests, up from 624 at the start of this
  pass), `pnpm test:e2e` (235, unchanged throughout) all pass as of the last
  commit.
- Each stage was additionally verified manually against a running instance
  (curl) — see each stage's "Verification done this pass" in the spec.
  Notably, stage 5's fix was checked against the audit's exact original
  repro: `POST /auths/register` with `name: "<script>alert(1)</script>"`
  now returns `400`/`CONTAINS_MARKUP` instead of `201`.

## Next: testing session

Per root `CLAUDE.md`, verification of these fixes is a **separate** Claude
Code session against this same worktree — do not test-and-implement in one
session. Treat `specs/security-hardening.md` as the source of truth for
intended behavior (each of its 5 sections documents the finding, the design
decision, and what was deliberately left out).

## Gotchas hit this pass (so they aren't re-discovered)

- **`TESTING-HANDOFF.md` at this worktree's root is not this feature's.**
  It's `user-profile`'s testing handoff doc, committed on that branch and
  merged into `master` before this worktree was created. Leave it alone;
  this feature's own testing handoff (if the testing session pauses before
  finishing) should use a different name so it doesn't read as a
  continuation of that unrelated doc.
- `@nestjs/throttler@^6.5.0`'s peer-dep range caps at `@nestjs/common@^11`,
  one major behind this repo's `@nestjs/common@12.0.1` — installs fine (pnpm
  doesn't enforce strict peer deps here), expected and documented in
  `specs/security-hardening.md` §1.
- `express` had to be added as an explicit `backend/package.json` dependency
  (stage 3) — it was previously only a transitive dep of
  `@nestjs/platform-express`, with just `@types/express` declared directly,
  which is enough for `import type` but not for importing `json`/
  `urlencoded` as runtime values.
- **Middleware order matters for helmet + body-size limits** (stage 3):
  `helmet()` must be registered *before* `json()`/`urlencoded()` in
  `main.ts`. When the body-size middleware rejects an oversized body,
  Express routes straight to the exception filter, skipping any later
  regular middleware — if helmet ran after, a rejected request's response
  would ship without helmet's headers (concretely: `X-Powered-By: Express`
  leaked on the `413` response until this was fixed).
- MCP tool input validation (stage 4) intentionally stays **two-layered**,
  not a replacement: the zod `inputSchema` is still what the LLM client
  sees (per `specs/backend-mcp-server.md`'s existing decision to keep MCP
  wire schemas JSON-schema/zod, not `class-validator`-bound); the DTO
  `validate()` call is an internal safety net on top. `get_cheapest_listing`
  deliberately still uses `Object.assign` — it builds its DTO from an
  already-validated `fragranceId` plus internal constants, no raw args.
- The `IsNotMarkup` check (stage 5) is intentionally blunt — rejects any
  bare `<`/`>`, not an HTML-aware parser — per the finding's own stated
  minimum bar. It will also reject harmless text like `"5 > 3"` in a
  fragrance description; that's a known, accepted tradeoff, not a bug to
  "fix" by making the check smarter without revisiting the spec first.

## Do not

- Delete or remove this worktree — a testing session still needs it.
- Test-and-implement in the same session.
- Merge/open a PR without being explicitly asked.
