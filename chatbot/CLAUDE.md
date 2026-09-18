# Chatbot server guidelines

See the repo-root [`CLAUDE.md`](../CLAUDE.md) for the monorepo-wide worktree/testing-session/module-documentation rules, [`platform-spec.md`](../platform-spec.md) §6 for the product-level decisions, and [`specs/chatbot-server.md`](../specs/chatbot-server.md) for the feature spec (source of truth for behavior) — this file only covers stack-specific conventions for `chatbot/`.

Stack: **plain TypeScript, no framework** (explicit choice — `ws` + `@google/genai` + `@modelcontextprotocol/sdk` are enough for this server's scope; adding Nest/Express/Socket.io would be unjustified weight). `tsx` runs it directly in dev, `tsc` builds it for `start`. `oxlint` for linting and `prettier` for formatting, matching `backend/`.

## Layout

```
chatbot/
  src/
    main.ts              # entrypoint: loads config, connects MCP servers, starts the WS server
    config.ts             # env + mcp-servers.json loading/validation
    logger.ts             # tiny timestamped console logger
    protocol.ts           # WS JSON message parsing/building (specs/chatbot-server.md, "Protocolo websocket")
    session.ts            # ChatSession: per-connection state, guardrail stage 1 + agent orchestration, history truncation
    websocket-server.ts   # `ws` server wiring, one ChatSession per connection
    mcp/
      mcp-manager.ts       # connects to every configured MCP server, aggregates+namespaces tools, dispatches tools/call
    guardrail/
      prompts.ts            # stage-1 judge system prompt + fixed rejection copy
      scope-classifier.ts   # stage-1 Gemini-as-judge call (fail-open on failure)
    agent/
      system-prompt.ts      # stage-2 system prompt
      chat-agent.ts          # main Gemini tool-calling loop
    NOTES.md               # non-obvious implementation decisions the spec doesn't fix — read before touching agent/chat-agent.ts or session.ts's truncation logic
  dev-mcp-stub/            # THROWAWAY stub MCP server, NOT the real fragrances/vendors/pricing MCP — see its README.md
  mcp-servers.json         # declarative list of MCP servers to connect to (empty by default)
  .env.example / .env      # same pattern as backend/ and similarityServer/
```

## Conventions

- **Module boundaries**: `mcp/`, `guardrail/`, `agent/` are self-contained — `session.ts` orchestrates them but doesn't reach into their internals beyond the exported functions/classes.
- **Adding/removing an MCP server**: edit `mcp-servers.json` (or whatever `MCP_CONFIG_PATH` points at). Never hardcode a server's connection details in `mcp-manager.ts` — that file has no server-specific code, by design (specs/chatbot-server.md, "Registro modular de tools multi-MCP").
- **Errors**: match the table in `specs/chatbot-server.md`, "Manejo de errores" — a broken MCP server, a failed tool call, or a failed Gemini call must never crash the WS connection; they become a `{"type":"error"}` turn-level message or an error result handed back to Gemini, per case.
- **History**: never truncate mid-turn (see `src/NOTES.md`, "Truncamiento de historial por turno completo") — a "turn" includes every tool-calling round-trip within it.
- **Lint/format**: run `pnpm lint` (oxlint) and `pnpm format` (prettier) before finishing a task, same as `backend/`.
- **Local dev with tool calling**: run `pnpm dev:mcp-stub` in one terminal and set `MCP_CONFIG_PATH=./dev-mcp-stub/mcp-servers.dev.json` (or copy that file's content into your own `mcp-servers.json`) before `pnpm dev`, to exercise the tool-calling loop against the disposable stub. Swap it for the real MCP server's config once that dependency exists — the stub is not meant to survive past this feature's development.
- **Testing**: per the root convention, writing/running tests that validate this feature's own behavior happens in a separate testing session — see `specs/chatbot-server.md` for the acceptance behavior and the guardrail edge-case table to start from.
