# Mario da Parfums — global conventions

Monorepo (pnpm workspaces): `backend/` (NestJS API), `frontend/`, `chatbot/`. These conventions apply to all packages. Package-specific stack guidelines live in that package's own `CLAUDE.md` (e.g. `backend/CLAUDE.md`).

## Worktree-per-feature workflow

Every new feature gets its own git worktree, created with Claude Code's `--worktree` flag, so it has an independent directory, branch, and Claude Code session.

- One feature = one worktree = one branch. Don't mix unrelated work into a worktree that already has a feature in flight — start a new one instead.
- **Do not delete the worktree when the implementation session ends.** It must stay in place until testing is done and the feature is fully wrapped up. A worktree removed early destroys the isolated state another session needs to test against.
- Run `git worktree list` before creating a new one, to see what's already in flight and avoid path/branch collisions.

## Feature spec (`specs/<feature>.md`)

Every feature gets a spec file agreed between the user and Claude before/while implementing it — the written record of what the requirement actually means, not a design doc and not a restatement of the code.

- **Location**: `specs/<feature-slug>.md` at the repo root (monorepo-wide — a feature isn't necessarily scoped to one package). `<feature-slug>` matches the feature's branch name (e.g. branch `feature/listing-auctions` → `specs/listing-auctions.md`). One spec per feature, living in that feature's worktree.
- **Create it early**: draft it as soon as the requirement is understood — before writing code, or alongside the first pass of implementation — and settle open questions with the user directly in it rather than assuming. Update it if the agreed behavior changes mid-implementation; it should reflect what was actually agreed, not just what was originally asked.
- **Content**: the behavior being built, business rules and constraints, explicit edge cases and how they're meant to behave, and anything explicitly out of scope. Not implementation notes, not a task list — a specification, testable independent of how it ends up coded.
- **It is the basis for black-box/spec-based testing** — see the `testing` skill (`.claude/skills/testing/SKILL.md`). The testing session treats `specs/<feature-slug>.md` as its primary source of truth, ahead of re-deriving intent from the implementation.
- **It is shared context for every agent touching the feature** — implementation session, testing session, and any subagents spawned for either — so they all work from the same agreed intent instead of independently re-deriving or guessing it.
- Keep it in the worktree until the feature is fully wrapped up, same as the worktree itself; don't delete it once written.

## Implementation and testing are separate sessions

The session that implements a feature must **not** test it. Testing happens in a **different** Claude Code session (a fresh session opened against the same worktree), so the person/agent verifying the work isn't biased by having just written it.

- If you just implemented a feature: stop after implementation, lint, and self-checks that aren't "does this feature work as intended" (type-checking, running existing test suites for regressions is fine — writing/validating *new* behavior against the feature's own intent is not). Leave the worktree in place and hand off.
- If you're asked to test a feature: treat it as an independent reviewer. Don't assume the implementation is correct just because it looks complete — verify against the actual requirements.
- **Use the `testing` skill** (`.claude/skills/testing/SKILL.md`) whenever writing or evaluating tests: black-box test design (two-point boundary analysis, decision-table condition coverage, 0-switch finite-state coverage where the feature has explicit state), search-based fuzzing (hill climbing) for hard-to-construct inputs, and mutation testing (mutation score) to judge whether the resulting suite is actually worth anything. Every executable module gets unit tests; integration tests are added on top only when the feature requires it, per that skill's scope gate.

## Module documentation (`NOTES.md`) and `docs/`

No mirrored `src_docs`/`test_docs` tree, and no one-`.md`-per-source-file. Two places for docs, with distinct roles — pick by where the decision actually lives, not by habit:

- **`NOTES.md`, living inside the module directory it documents** (e.g. `src/auths/NOTES.md`, `src/database/NOTES.md`) — one file per module/directory, next to the code, not a parallel tree. Use it only for real business logic and non-obvious agreements that belong to that module — a race-condition workaround, a deliberate security choice, a schema quirk, a scope boundary a test deliberately doesn't cover. **Most directories don't need one.** Don't create it for a module that's just scaffolding, or restate what a well-named function/class/decorator already makes obvious — a doc that only restates the identifiers is worse than no doc, it's a file to keep in sync for zero benefit. Organize a module's `NOTES.md` by topic/file internally if that helps navigation, but keep it one file per directory, not one per source file.
- **`docs/`** (package root, e.g. `backend/docs/`) — for decisions that cross multiple modules and don't have one module as their natural owner (e.g. `error-handling.md` and `validation-error-codes.md`, each spanning a pipe, a filter, and an enum catalog together, none of which alone owns the decision). Use this when a decision wouldn't fit naturally under any single module's `NOTES.md`.
- Both are programmer-facing documentation, not context for Claude to consume during normal work — don't read either just to understand code, read the code.
- When adding or materially changing a file in `src/`/`test/`: update that module's `NOTES.md` only if the change introduces or changes a decision worth recording — not for every touch. When the change is a cross-cutting decision instead, update the relevant `docs/` file.
