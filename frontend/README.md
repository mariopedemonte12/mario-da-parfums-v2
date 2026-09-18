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

There is no test runner configured in this package.

## Environment variables

There is no example env file for this package. All variables are optional and have local defaults in `src/lib`:

- `NEXT_PUBLIC_BACKEND_API_URL` (default `http://localhost:3000`)
- `NEXT_PUBLIC_QUERY_API_URL` (default `http://localhost:8001`)
- `NEXT_PUBLIC_CHATBOT_WS_URL` (default `ws://localhost:8081`)

The backend allows CORS from `http://localhost:3010` by default, so run the frontend on that port (`pnpm dev -p 3010`) or set `FRONTEND_URL` in the backend.

## Docs

- Per-area `NOTES.md`: [`src/components/ui`](./src/components/ui/NOTES.md), [`src/features/auth`](./src/features/auth/NOTES.md), [`src/features/layout`](./src/features/layout/NOTES.md), [`src/features/legal`](./src/features/legal/NOTES.md).
- Design reference: [`designGuidelines/`](./designGuidelines).
