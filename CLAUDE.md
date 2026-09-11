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

## Graphify

This project uses the `graphify` skill to map the codebase (modules, controllers, services, entities, and their relationships) into a persistent knowledge graph.

- **Before exploring code to answer a question or plan a change, query the graph first** (`/graphify query "<question>"`, `/graphify path "<A>" "<B>"`, `/graphify explain "<Node>"`). Treat "how does X work", "what calls Y", "where is Z used", "what would break if I change W" as graph queries first.
- **Only traverse the path graphify returns — nothing beyond it** — unless the user explicitly asks for broader exploration. The graph exists to save tokens; re-exploring everything "just in case" defeats the point.
- Fall back to manual exploration (Explore agent, grep, Read) only if the graph doesn't have the answer or the file is new/untracked.
- **Never run `/graphify --update` inside a feature worktree — not the implementation session, not the testing session.** The worktree is discarded once the feature is fully wrapped up, so any graph update done there is thrown away with it — pure wasted work. Query the graph as it stood when the worktree was created; files this feature itself added or changed simply aren't in it yet — that's expected, fall back to manual exploration for those (per above), don't update the graph to cover them.
- **The graph is local to whatever checkout it's built in — never committed** (`graphify-out/` is gitignored) and never shared or merged between checkouts. A feature worktree's graph exists only to serve queries during that feature's own work and is discarded with the worktree; it is never merged into main's graph.
- **The graph is regenerated in exactly one place: main's checkout, after a feature branch merges in.** Update it manually there — in main's checkout, run `/graphify --update`. Since `graphify-out/` persists on disk across sessions in that same checkout (it's just gitignored, not deleted), this re-extracts only the files the merge actually changed — main's graph advances incrementally, one merge at a time, independent of how many feature worktrees are in flight elsewhere. Do this on every merge, even a fast-forward, so the next feature worktree branches off a clean, up-to-date graph.

## Module documentation (`NOTES.md`) and `docs/`

No mirrored `src_docs`/`test_docs` tree, and no one-`.md`-per-source-file. Two places for docs, with distinct roles — pick by where the decision actually lives, not by habit:

- **`NOTES.md`, living inside the module directory it documents** (e.g. `src/auths/NOTES.md`, `src/database/NOTES.md`) — one file per module/directory, next to the code, not a parallel tree. Use it only for real business logic and non-obvious agreements that belong to that module — a race-condition workaround, a deliberate security choice, a schema quirk, a scope boundary a test deliberately doesn't cover. **Most directories don't need one.** Don't create it for a module that's just scaffolding, or restate what a well-named function/class/decorator already makes obvious — a doc that only restates the identifiers is worse than no doc, it's a file to keep in sync for zero benefit. Organize a module's `NOTES.md` by topic/file internally if that helps navigation, but keep it one file per directory, not one per source file.
- **`docs/`** (package root, e.g. `backend/docs/`) — for decisions that cross multiple modules and don't have one module as their natural owner (e.g. `error-handling.md` and `validation-error-codes.md`, each spanning a pipe, a filter, and an enum catalog together, none of which alone owns the decision). Use this when a decision wouldn't fit naturally under any single module's `NOTES.md`.
- Both are programmer-facing documentation, not context for Claude to consume during normal work — don't read either just to understand code, read the code (or query graphify).
- **Both are excluded from the graphify graph.** Don't add `NOTES.md`/`docs/` files as nodes and don't traverse them when following a graphify path.
- When adding or materially changing a file in `src/`/`test/`: update that module's `NOTES.md` only if the change introduces or changes a decision worth recording — not for every touch. When the change is a cross-cutting decision instead, update the relevant `docs/` file.
