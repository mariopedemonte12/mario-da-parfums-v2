# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f backend/Dockerfile .
# The build context is the monorepo root because pnpm resolves dependencies
# through the ROOT pnpm-lock.yaml / pnpm-workspace.yaml (backend/pnpm-lock.yaml
# is not the source of truth).
#
# Targets:
#   runtime (default) -> NestJS API, production deps only
#   migrate           -> one-shot `drizzle-kit migrate` (needs devDependencies,
#                        so it is built from the full `build` stage, not runtime)

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN npm install -g pnpm@12.4.1 && pnpm config set store-dir /pnpm/store
WORKDIR /app

# ---- build: full install (dev deps) + nest build
FROM base AS build
# Manifests of every workspace member: pnpm validates the frozen lockfile
# against all of them, even though we only install `backend`.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY chatbot/package.json chatbot/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter backend...
COPY backend backend
RUN pnpm --filter backend build

# ---- migrate: applies backend/drizzle/*.sql against DATABASE_URL, then exits
FROM build AS migrate
WORKDIR /app/backend
CMD ["pnpm", "db:migrate"]

# ---- prod-deps: production node_modules only
FROM build AS prod-deps
RUN pnpm --filter backend --prod deploy /prod/backend

# ---- runtime
FROM node:22-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /prod/backend/node_modules node_modules
COPY --from=build --chown=node:node /app/backend/dist dist
COPY --chown=node:node backend/package.json package.json
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
