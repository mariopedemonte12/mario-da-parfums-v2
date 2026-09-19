# frontend

Next.js 16 (App Router) + React 19 + Tailwind CSS 4 web app for Mario da Parfums: fragrance catalog and search, fragrance detail with vendor listings, auth, favorites, profile, and a chatbot widget. Conventions are in [`CLAUDE.md`](./CLAUDE.md) and [`AGENTS.md`](./AGENTS.md).

## Development

From the repo root run `pnpm install` once (pnpm workspace), then from `frontend/`:

```bash
pnpm dev
```

The backend API, the similarity search service and the chatbot server must be running for the corresponding features to work.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | `next dev` |
| `pnpm build` | `next build` |
| `pnpm start` | `next start` |
| `pnpm lint` | `eslint` |
| `pnpm typecheck` | `next typegen && tsc --noEmit` |
| `pnpm test` | `vitest run --maxWorkers=1` (single run) |
| `pnpm test:watch` | `vitest` (watch mode) |

`pnpm typecheck` runs `next typegen` first because Next 16 generates global types such as `LayoutProps` / `PageProps` (under the git-ignored `.next/`); a bare `tsc --noEmit` on a fresh checkout reports them as missing.

## Tests

Vitest (same version as backend and chatbot). Tests live next to the code as `*.test.ts` / `*.test.tsx`. The default environment is `node`, for pure logic (utils, api functions with `fetch` mocked). A component test opts into the DOM with a `// @vitest-environment jsdom` comment on its first line and uses `@testing-library/react` + `@testing-library/user-event`. `@/*` resolves to `src/*` (see `vitest.config.mts`).

Hook, context and WebSocket-client tests live next to the code: `useAuth`, `useProfile`, `useFavorites`, `useFragrances`, `useFragranceDetail`, `useFragranceSearch`, `useListingsByFragrance`, `useVendors`, `useDebounce`, `useChatbotSession` (plain and under `<StrictMode>`, to catch impure `setState` updaters), `lib/ws/client` and `lib/api/client`. Shared test doubles are in `src/test/`: `FakeWebSocket` (hand-driven socket events), `FakeWsClient` (stand-in for `chatbotWs`) and fetch helpers (`stubFetch`, `deferred` for out-of-order responses). Use braces in `beforeEach(() => { mock.mockReset(); })`: vitest 4 `mockReset()` returns the mock, and a returned function is run as teardown.

The data-hook, auth-cache and API-client defects found by the independent testing session are fixed and their cases are ordinary `it(...)` tests. Known defects still open are recorded as `it.fails(...)` cases whose title starts with `BUG:` (the suite stays green; when the bug is fixed the case flips to failing, so remove `.fails`); at the moment they are all in the chatbot session hook and WebSocket client. Find them with `grep -rn "it.fails" src`.

## Environment variables

There is no env file or example for this package: `next.config.ts` loads the single repo-root env file (`<repo root>/.env`, template [`../.env.example`](../.env.example)) with `@next/env`, so `next dev` / `next build` see its `NEXT_PUBLIC_*` values. The file is optional (in Docker they come from build args) and real environment variables win over it. Do not put a `.env` in `frontend/`. All variables are optional and have local defaults in `src/lib`:

- `NEXT_PUBLIC_BACKEND_API_URL` (default `http://localhost:3000`)
- `NEXT_PUBLIC_QUERY_API_URL` (default `http://localhost:8001`)
- `NEXT_PUBLIC_CHATBOT_WS_URL` (default `ws://localhost:8081`)

The backend allows CORS from `http://localhost:3010` by default, so run the frontend on that port (`pnpm dev -p 3010`) or set `FRONTEND_URL` in the backend.

## Docs

- Per-area `NOTES.md`: [`src/components/ui`](./src/components/ui/NOTES.md), [`src/features/auth`](./src/features/auth/NOTES.md), [`src/features/layout`](./src/features/layout/NOTES.md), [`src/features/legal`](./src/features/legal/NOTES.md).
- Design reference: [`designGuidelines/`](./designGuidelines).
