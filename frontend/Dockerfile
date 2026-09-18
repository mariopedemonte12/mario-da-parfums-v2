# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f frontend/Dockerfile .
# (context = monorepo root: dependencies resolve through the root pnpm-lock.yaml)
#
# NEXT_PUBLIC_* values are inlined into the client bundle at `next build`, so
# they are BUILD ARGS, not runtime env. They must be the URLs the user's
# BROWSER can reach (published host ports / public domain) — never Docker-internal
# service names like http://backend:3000. Changing them requires a rebuild.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.4.1 && pnpm config set store-dir /pnpm/store
WORKDIR /app

# ---- build
FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY chatbot/package.json chatbot/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter frontend...
COPY frontend frontend
ARG NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3000
ARG NEXT_PUBLIC_QUERY_API_URL=http://localhost:8001
ARG NEXT_PUBLIC_CHATBOT_WS_URL=ws://localhost:8081
ENV NEXT_PUBLIC_BACKEND_API_URL=$NEXT_PUBLIC_BACKEND_API_URL \
    NEXT_PUBLIC_QUERY_API_URL=$NEXT_PUBLIC_QUERY_API_URL \
    NEXT_PUBLIC_CHATBOT_WS_URL=$NEXT_PUBLIC_CHATBOT_WS_URL
RUN pnpm --filter frontend build

# ---- runtime: Next.js standalone server (traced from the monorepo root, so the
# app lives under ./frontend inside the standalone folder)
FROM node:22-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3010 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static frontend/.next/static
USER node
EXPOSE 3010
CMD ["node", "frontend/server.js"]
