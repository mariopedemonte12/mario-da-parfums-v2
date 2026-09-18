# backend

NestJS 12 REST API for Mario da Parfums (fragrance catalog, vendor listings, users, favorites, auth). Data lives in PostgreSQL via Drizzle ORM. It also exposes an MCP server (`src/mcp`) used by the chatbot. Conventions are in [`CLAUDE.md`](./CLAUDE.md); the monorepo-wide rules are in the root [`CLAUDE.md`](../CLAUDE.md).

## Development

From the repo root, install once with `pnpm install` (pnpm workspace). Then, from `backend/`:

```bash
# once, in the repo root: cp .env.example .env  (single env file for the whole repo)
# and, also in the repo root: docker compose up -d postgres migrate  (local Postgres 16)
pnpm db:migrate               # apply the migrations in drizzle/ (skip if `migrate` ran)
pnpm start:dev                # watch mode, listens on PORT (default 3000)
```

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm build` / `start` / `start:dev` / `start:debug` / `start:prod` | Build and run the app with the Nest CLI (`start:prod` runs `dist/main`) |
| `pnpm lint` | `oxlint src/ test/` |
| `pnpm format` | `prettier --write` on `src/` and `test/` |
| `pnpm test` / `test:watch` / `test:cov` | Vitest unit tests (`*.spec.ts` next to the code) |
| `pnpm test:e2e` | Vitest e2e tests in `test/` (`vitest.config.e2e.ts`); they need a real Postgres |
| `pnpm test:mutation` | Stryker mutation testing |
| `pnpm db:generate` / `db:migrate` | Drizzle Kit: generate / apply migrations |

## Environment variables

The backend reads the single repo-root env file (`<repo root>/.env`, template [`../.env.example`](../.env.example)); there is no backend-specific file. It is optional (absent inside Docker) and real environment variables always win over it. `src/config/root-env.ts` finds the root from the module location, so it works from `src/`, `dist/` and any cwd; `drizzle.config.ts` (the `db:*` scripts) uses the same loader. Variables it reads:

- `DATABASE_URL` (Drizzle; host mode uses `localhost:<POSTGRES_HOST_PORT>`)
- `JWT_SECRET` (required to sign tokens) and `JWT_EXPIRES_IN` (default `15m`)
- `PORT` (default `3000`)
- `FRONTEND_URL` (CORS origin, default `http://localhost:3010`)

## Docs

- [`docs/error-handling.md`](./docs/error-handling.md) and [`docs/validation-error-codes.md`](./docs/validation-error-codes.md): cross-module decisions.
- Per-module `NOTES.md` files: `src/auths`, `src/common`, `src/database`, `src/favorites`, `src/fragrances`, `src/listings`, `src/mcp`, `src/passwords`, `src/pipes`, `src/users`, `src/validators`, `src/vendors`.
