# backend

NestJS 12 REST API for Mario da Parfums (fragrance catalog, vendor listings, users, favorites, auth). Data lives in PostgreSQL via Drizzle ORM. It also exposes an MCP server (`src/mcp`) used by the chatbot. Conventions are in [`CLAUDE.md`](./CLAUDE.md); the monorepo-wide rules are in the root [`CLAUDE.md`](../CLAUDE.md).

## Development

From the repo root, install once with `pnpm install` (pnpm workspace). Then, from `backend/`:

```bash
cp .env.example .env          # fill in the values, see below
docker compose up -d          # local Postgres 16 (docker-compose.yml)
pnpm db:migrate               # apply the migrations in drizzle/
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

See [`.env.example`](./.env.example) for the Postgres credentials and `DATABASE_URL`. The code also reads these variables, which are not in the example file:

- `JWT_SECRET` (required to sign tokens) and `JWT_EXPIRES_IN` (default `15m`)
- `PORT` (default `3000`)
- `FRONTEND_URL` (CORS origin, default `http://localhost:3010`)

## Docs

- [`docs/error-handling.md`](./docs/error-handling.md) and [`docs/validation-error-codes.md`](./docs/validation-error-codes.md): cross-module decisions.
- Per-module `NOTES.md` files: `src/auths`, `src/common`, `src/database`, `src/favorites`, `src/fragrances`, `src/listings`, `src/mcp`, `src/passwords`, `src/pipes`, `src/users`, `src/validators`, `src/vendors`.
