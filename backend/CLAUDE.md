# graphify

This project has a graphify knowledge graph at `graphify-out/graph.json`. It maps every module, controller, service, entity, and their relationships.

**Before exploring the codebase to answer a question or plan a change, query the graph instead of grepping/reading files blindly:**

```
/graphify query "<question>"
/graphify path "<A>" "<B>"
/graphify explain "<Node>"
```

Treat any question about architecture, "how does X work", "what calls Y", "where is Z used", or "what would break if I change W" as a graphify query first. Only fall back to manual exploration (Explore agent, grep, Read) if the graph doesn't have the answer or the file is new/untracked.

**After finishing a feature (new module, endpoint, entity, or any structural change to `src/`), update the graph before ending the task:**

```
/graphify --update
```

Do this even if not explicitly asked — a stale graph is worse than no graph, since it will confidently return outdated answers. If several structural changes happen in one session, one `--update` at the end is enough; no need to update after every file edit.

---

# NestJS guidelines (this backend)

Stack: NestJS 12, Drizzle ORM (`src/database`), `class-validator`/`class-transformer` for DTOs, `argon2` for password hashing, Vitest for tests, oxlint for linting. Modules live under `src/<domain>` (e.g. `src/fragrances`, `src/listings`, `src/vendors`, `src/users`, `src/auths`).

- **Module boundaries**: each domain (`fragrances`, `listings`, `vendors`, `users`, `auths`, ...) is a self-contained Nest module — controller, service, DTOs, entities. Don't reach into another module's internals; import its service through the module's exports instead.
- **Layering**: controllers handle HTTP concerns only (routing, status codes, param parsing) and delegate to services. Services hold business logic and talk to the database via Drizzle. Don't put query logic in controllers or HTTP concerns in services.
- **DTOs**: every controller input is a class in `<module>/dto` validated with `class-validator` decorators. Use `@nestjs/mapped-types` (`PartialType`, `PickType`) to derive update/patch DTOs from create DTOs instead of redeclaring fields.
- **Entities/schema**: Drizzle table definitions live in `src/database/schema`; per-module `entities` folders hold derived types (e.g. `InferSelectModel`), not new schema. Never hand-write SQL when a Drizzle query builder call does the job.
- **Dependency injection**: use constructor injection with `private readonly`. Don't instantiate services manually or use service locator patterns.
- **Guards/pipes/filters/decorators**: shared cross-cutting code goes in `src/common` (guards, filters, decorators) or `src/pipes`, not duplicated per-module. Check there before writing a new guard/pipe/filter.
- **Validation beyond class-validator**: custom validators live in `src/validators` (with `config`, `helpers`, `wrappers` subfolders) — follow that structure for new custom validation logic rather than inlining it in DTOs.
- **Errors**: throw Nest's built-in HTTP exceptions (`NotFoundException`, `BadRequestException`, `ConflictException`, etc.) from services; let the global exception filter in `src/common/filters` handle formatting. Don't catch-and-swallow errors in controllers.
- **Auth**: password hashing goes through `src/passwords` (argon2); JWT handling goes through `src/auths`. Don't call `argon2` or `@nestjs/jwt` directly from other modules.
- **Shared enums/types**: put cross-module enums in `src/shared/enums` rather than redefining them per module.
- **Testing**: use Vitest (`*.spec.ts` next to the code for unit tests, `test/` for e2e via `vitest.config.e2e.ts`). Mock Drizzle/db access at the service boundary in unit tests; e2e tests hit a real test database. Run `pnpm test` (or `test:e2e`) before considering a feature done.
- **Lint/format**: run `pnpm lint` (oxlint) and `pnpm format` (prettier) before finishing a task — don't hand-format.
- **New feature checklist**: worktree + branch (see Git & worktrees below) → module folder → schema/entities → DTOs → service → controller → module wiring (imports/providers/exports in `<module>.module.ts` and `app.module.ts`) → tests → lint → update the graphify graph → commit/push.

---

# Git & worktrees

This backend lives inside the `mario-da-parfums-v2` monorepo (git root is the parent directory, not `backend/`) — run all `git`/`git worktree` commands from the repo root, one level up from here.

**Every new feature gets its own git worktree**, checked out to a dedicated branch, so multiple features can be worked on in parallel without one branch's uncommitted state (deps, running dev server, DB migrations) colliding with another's. Don't just `git checkout -b` inside the main working copy for feature work — that blocks switching to a different feature without stashing.

- **Branch naming**: `feature/<short-name>` for features, `fix/<short-name>` for bug fixes, `chore/<short-name>` for maintenance. Branch off `master`.
- **Create the worktree** (from the repo root, e.g. `/home/mariopedemonte12/code/mario-da-parfums-v2`):
  ```bash
  git worktree add ../mario-da-parfums-v2-<short-name> -b feature/<short-name> master
  ```
  This creates a sibling directory (not nested inside the current repo) with its own checkout of `feature/<short-name>`, sharing the same `.git` history/objects.
- **Set up the new worktree** before coding: it needs its own `node_modules` (pnpm install), since worktrees don't share installed deps:
  ```bash
  cd ../mario-da-parfums-v2-<short-name> && pnpm install
  ```
- **Work the feature entirely inside that worktree** — run dev server, tests, lint, and graphify updates from there, not from the main checkout.
- **Actually move into the worktree**: after creating it, `cd` into `../mario-da-parfums-v2-<short-name>` and treat that as the working directory for the rest of the task — don't stay in the main checkout and reach into the worktree via absolute paths for every command. Tell the user the worktree's path once you're in it, so they can point their editor (VSCode, etc.) at that folder instead of the main checkout — otherwise the changes won't show up in whatever they have open.
- **When the feature is done**: commit, push the branch, open the PR from the worktree. Once the PR is merged (or the branch is abandoned), remove the worktree rather than leaving it around:
  ```bash
  git worktree remove ../mario-da-parfums-v2-<short-name>
  git branch -d feature/<short-name>   # after merge
  ```
- **List active worktrees** with `git worktree list` before creating a new one, to avoid duplicate branches/paths and to see what other features are currently in flight.
- Never work on two unrelated features in the same worktree/branch. If scope creeps into a second feature, stop and create a new worktree for it instead of piling both onto one branch.
