---
name: security-audit
description: "Use for an end-to-end security audit of this monorepo — backend, frontend, chatbot server, similarityServer, priceGenerator, and the database — covering injection (SQL/NoSQL/command), XSS/JS injection, credential/secret exposure, access control over confidential data, DoS resilience, API misuse, and backend code execution (RCE). Distinct from the built-in `security-review` skill, which only reviews the pending diff — this skill audits the whole running system, not just a changeset. Triggers: \"audit de seguridad\", \"seguridad end to end\", \"pentest\", \"revisar seguridad del sitio\", \"SQL injection\", \"XSS\", \"inyección\", \"fuga de credenciales\", \"denegación de servicio\", \"security audit\", \"is this secure\"."
---

# Security Audit (End-to-End)

A whole-system security audit across every service in this monorepo: `backend` (NestJS API + Postgres via Drizzle), `frontend` (Next.js), `chatbot` (WS agent server + MCP + Gemini), `similarityServer` (FastAPI semantic search), `priceGenerator`. Complements the root [`CLAUDE.md`](../../../CLAUDE.md) conventions — a violation of a stated stack convention (e.g. backend/CLAUDE.md's "never hand-write SQL", "password hashing only through `src/passwords`") is very often the bug itself, so read the relevant package `CLAUDE.md` before auditing that package.

This is **audit and report**, not implement-and-fix — same separation-of-concerns spirit as implementation/testing sessions in this repo. Report findings; only fix if the user explicitly asks, and treat that as a separate pass.

## Ground rules — read first

- **Authorization & target**: only test environments the user owns — local dev or a staging/test instance they name. Never run active exploitation (payloads, load tests) against a production domain or anything not confirmed as theirs, per the global "authorized security testing" policy.
- **Passive vs active**: static/code analysis, dependency audits, and config review are always safe and need no extra confirmation. Sending payloads to a *running* instance (injection strings, XSS probes, auth-bypass attempts, load checks) is active testing — confirm the target and environment with the user before starting that phase.
- **DoS pillar = verify controls, don't attack**: check that rate limiting, pagination caps, query timeouts, and payload-size limits exist and are configured — don't actually flood an endpoint. If the user explicitly wants a bounded load check, keep it small (tens of requests, not thousands) and local-only.
- **Secrets hygiene**: never paste a live secret/credential found during the audit into chat or a report in full — redact it (`sk-...abcd`) when demonstrating the finding.
- **Real data**: if a real user database or production data is reachable from the target, stop and flag it before running any injection payload against it.
- **No offensive tooling** (sqlmap, ZAP/Burp automated scans, nikto, etc.) unless the user explicitly names the tool and confirms the target — default to manual/scripted checks below.

## The 7 pillars

Map every finding to one of these (plus the baseline hygiene checks, which aren't optional):

1. **Injection** — SQL, NoSQL, command, template, LLM prompt injection reaching a tool call.
2. **JS injection / XSS** — reflected, stored, DOM-based; CSP.
3. **Credential & secret exposure** — hardcoded secrets, leaked hashes/tokens, verbose error/stack-trace leakage.
4. **Confidential data / access control** — IDOR, broken authz, PII over-exposure, CORS misconfig.
5. **DoS resilience** — rate limiting, pagination caps, timeouts, payload-size limits (verify, don't attack).
6. **API misuse** — mass assignment, excessive data exposure, wrong HTTP semantics, missing validation.
7. **Backend code execution (RCE)** — unsafe deserialization, `eval`/`exec`, unrestricted file upload, SSRF, SSTI.

## Recon phase

- Map the attack surface: every backend controller route (`backend/src/**/*.controller.ts`), the chatbot WS protocol (`chatbot/src/protocol.ts`), similarityServer's FastAPI routes, any admin/internal-only endpoints.
- Note trust boundaries: which routes are public vs behind `@UseGuards(JwtAuthGuard)` vs role-gated.
- Note external integrations: Postgres (Drizzle), Gemini API, MCP servers (`chatbot/mcp-servers.json`), any price-source integration in `priceGenerator`.
- Locate secrets/config: `.env`/`.env.example` per package, `JWT_SECRET`, `GEMINI_API_KEY`, DB credentials.

## Testing methodology per pillar

### 1. Injection
- Backend/similarityServer: grep for raw SQL (`` sql` ``, `.execute(`, string-concatenated queries) — Drizzle's query builder is the required path per `backend/CLAUDE.md`; any raw SQL built from request input is a red flag. Python side: watch for f-string/`%`-built queries and unsafe `eval`/`exec`/`pickle.loads`.
- Confirm every controller input is a validated DTO (`class-validator`) — an endpoint accepting a loosely-typed body is a gap even before testing payloads.
- Live (with target confirmed): send classic payloads (`' OR '1'='1`, `'; DROP TABLE --`) through every filter/search field (fragrance name/brand search is a known LIKE-wildcard quirk per prior testing — confirm whether it's just a UX gap or an actual injection path) and confirm parametrized handling.
- Command injection: grep `backend/`, `chatbot/`, `priceGenerator/` for `exec(`, `execSync(`, `spawn(`, `eval(` reachable from user or model-controlled input — chatbot's tool-calling loop (`agent/chat-agent.ts`, `mcp/mcp-manager.ts`) is the highest-risk spot since it routes model output into tool calls.

### 2. JS injection / XSS
- Frontend: grep for `dangerouslySetInnerHTML`, direct `innerHTML` writes, or any markdown/HTML render of user- or model-controlled content (chat messages, listing descriptions, profile fields).
- Check for a CSP header (currently absent unless added to `next.config.ts` — flag if missing, don't assume React's default escaping is sufficient on its own).
- Live (Playwright, available locally — no MCP browser needed, plain Node script + cached chromium): inject `<script>alert(1)</script>` / `<img src=x onerror=...>` into every free-text input (search box, chat message, profile bio, listing description) and confirm neither immediate DOM reflection nor later stored rendering executes it.
- Session cookies (introduced in `auth-pages`): confirm `HttpOnly`, `Secure`, `SameSite` flags on the `Set-Cookie` response.

### 3. Credential & secret exposure
- Grep the whole repo (including active worktrees under `.claude/worktrees/`) for hardcoded secrets/API keys/DB passwords. Confirm `.env` files are gitignored and check `git log --all -- '*.env'` for accidental history commits.
- Confirm password hashing only goes through `src/passwords` (argon2, per `backend/CLAUDE.md`) — no plaintext password logging, and no `password`/hash field leaking through a user-serialization DTO.
- Confirm the global exception filter (`src/common/filters`) doesn't leak stack traces / DB connection details in non-dev responses.
- Confirm JWT signing secret strength, expiration, and that it's read from env, never hardcoded; check `chatbot/src/logger.ts` and Nest's logger for accidental secret/PII logging.

### 4. Confidential data / access control
- IDOR: for every `:id`-scoped route (profile, listings, favorites), confirm the guard checks *resource ownership*, not just "any valid JWT" — a logged-in user must not read/edit/delete another user's resource by guessing an ID.
- Confirm public-facing endpoints/listings never return PII (email, etc.) beyond what that screen needs.
- CORS: confirm an explicit origin allowlist, not `*` — especially combined with `credentials: true`. (Known to vary by worktree — check the specific target, don't assume it matches another package.)
- Confirm role/permission boundaries (user vs vendor, if applicable) are enforced server-side, not just hidden in the frontend.

### 5. DoS resilience (verify, don't attack)
- Confirm rate limiting (`@nestjs/throttler` or equivalent) on brute-forceable/expensive routes: login, register, semantic search, chat.
- Confirm list endpoints enforce a max page size server-side (per the `module-standards` skill's pagination convention) — an unbounded `limit` query param is a DoS vector.
- Confirm expensive queries (semantic search, full-text search) have timeouts, and request bodies/file uploads have a size cap.
- Confirm the chatbot WS server can't be crashed by a malformed message (uncaught exception in `session.ts` should never take down the process) and has a per-connection message-rate/size limit.

### 6. API misuse
- Mass assignment: confirm global `ValidationPipe`-equivalent (`backend/src/pipes/custom-validation.pipe.ts`) whitelists DTO fields and rejects unknown ones — an endpoint that silently accepts extra fields (e.g. a client setting its own `role` or `id`) is exploitable.
- Confirm HTTP verb usage matches the `module-standards` skill's conventions (no state-changing GET, PATCH vs PUT used consistently).
- Confirm response DTOs don't over-expose fields the frontend doesn't need (full entity returned instead of a public-shape DTO).

### 7. Backend code execution (RCE)
- Chatbot: the model-calls-tools loop is the highest-value target — confirm tool arguments from Gemini are validated/typed before being used, and that no code path does `eval`/`new Function()` on model or user text.
- File upload (if any exists, e.g. profile/listing images): server-side type and size validation (never trust client-side checks alone), no path traversal via filename, uploaded files never served from a path that gets executed.
- SSRF: any server-side fetch of a user- or model-supplied URL (MCP server registration, price-source calls) must not be able to reach internal/metadata endpoints.
- Dependency RCE: run the audit tool per package (`pnpm audit` for backend/frontend/chatbot, the Python equivalent for `similarityServer`) and flag criticals/highs with a known exploit.

## Baseline hygiene (always check, regardless of pillar)

- Security headers: CSP, `X-Content-Type-Options`, frame-ancestors/`X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`.
- HTTPS/TLS enforced in any prod-facing config.
- Dependency audit across every package (`pnpm audit`, Python equivalent).
- `.env`/secrets excluded from git and not present in history.
- CORS explicit and least-privilege per target service.

## Tooling

- **Static**: `grep`/ripgrep across the monorepo, `pnpm audit`, existing lint (`oxlint`) — a deviation from a package's own `CLAUDE.md` convention is itself often the finding.
- **Dynamic** (only against a confirmed, owned target): Playwright via a plain Node script (works locally without an MCP browser tool — see prior audit notes) to drive the app and inspect DOM/network; `curl`/httpie for direct endpoint probing.
- Don't reach for sqlmap/ZAP/Burp or similar unless the user names the tool and confirms the target explicitly.

## Reporting

Rank findings Critical/High/Medium/Low/Info. Each finding needs: location (`file:line` or route), pillar, concrete reproduction (the exact payload/request used), impact, and a fix recommendation that follows this repo's existing conventions (e.g. "use Drizzle's query builder" rather than "sanitize the string manually"). Use the `ReportFindings` tool's format when running inline as a review; otherwise a structured markdown summary is fine.

## Session flow

1. Confirm target + environment with the user (local dev / staging — never prod without explicit authorization) and whether active (payload-sending) testing is in scope, or static-only.
2. Recon: map attack surface across all services in scope.
3. Static pass: code review per the 7 pillars + baseline hygiene, grep-driven, checking against each package's `CLAUDE.md` conventions.
4. Dependency audit across all packages.
5. Dynamic pass, only if authorized and target confirmed: Playwright/curl-driven payload testing for injection/XSS/authz/rate-limit verification.
6. Compile the report, ranked by severity, with reproduction + fix guidance.
7. Hand off — don't auto-remediate unless the user asks for a separate fix pass.
