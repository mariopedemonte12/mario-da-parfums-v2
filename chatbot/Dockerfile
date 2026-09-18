# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f chatbot/Dockerfile .
# (context = monorepo root: dependencies resolve through the root pnpm-lock.yaml)

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN npm install -g pnpm@12.4.1 && pnpm config set store-dir /pnpm/store
WORKDIR /app

# ---- build: full install + tsc
FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY chatbot/package.json chatbot/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter chatbot...
COPY chatbot chatbot
RUN pnpm --filter chatbot build

# ---- prod-deps: production node_modules only
FROM build AS prod-deps
RUN pnpm --filter chatbot --prod deploy /prod/chatbot

# ---- runtime
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /prod/chatbot/node_modules node_modules
COPY --from=build --chown=node:node /app/chatbot/dist dist
COPY --chown=node:node chatbot/package.json package.json
# Declarative MCP server lists; MCP_CONFIG_PATH selects which one is read
# (default ./mcp-servers.json, i.e. the empty list).
COPY --chown=node:node chatbot/mcp-servers.json chatbot/mcp-servers.docker.json ./
USER node
EXPOSE 8081
CMD ["node", "dist/main.js"]
