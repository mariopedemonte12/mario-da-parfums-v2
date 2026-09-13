# mcp

Read-only MCP server over the fragrance catalog (fragrances/vendors/listings),
per `specs/backend-mcp-server.md`. Owns only the MCP transport/tool wiring —
no business logic beyond `get_cheapest_listing`'s sort, which lives in
`tools/register-catalog-tools.ts`.

- **Stateless transport**: `StreamableHTTPServerTransport` is constructed
  with `sessionIdGenerator: undefined`, and a fresh `McpServer` + transport
  pair is built per HTTP request (`McpServerFactory.create()`). There is no
  session to resume/terminate, so `GET`/`DELETE /mcp` always return
  `405`. Chosen because every tool here is a single stateless read — no
  reason to pay for session bookkeeping across requests.
- **Input validation is zod-only**, not the REST DTOs' `class-validator`
  pipeline: the MCP tool boundary never goes through Nest's HTTP layer
  (global `ValidationPipe`/`customValidationPipe`). A schema-shape error (bad
  UUID, wrong type) is reported as a normal `CallToolResult` with
  `isError: true` — the MCP SDK's own `McpServer.callTool` handler
  (`server/mcp.js`) catches the `McpError` thrown by its zod validation step
  and wraps it via `createToolError` before it ever reaches the JSON-RPC
  transport layer, so it never surfaces as a protocol-level error or a
  crash of the connection. Confirmed by testing directly against the
  installed SDK (`@modelcontextprotocol/sdk@1.30.0`) — see
  `tools/register-catalog-tools.spec.ts`. Failures *inside* a tool handler
  (not-found, DB failure) return `isError: true` results the same way, per
  `specs/backend-mcp-server.md`'s error table.
- Tools call `FragrancesService`/`VendorsService`/`ListingsService` directly,
  bypassing `FragrancesController`'s admin-only guard (guards attach to
  controllers, not services) — intentional: the MCP catalog reads are public,
  same as the vendors/listings REST reads.
