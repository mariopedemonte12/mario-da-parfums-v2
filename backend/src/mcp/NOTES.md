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
  (global `ValidationPipe`/`customValidationPipe`), so a schema-shape error
  (bad UUID, wrong type) is reported as a normal MCP/JSON-RPC error for that
  call — not a crash of the connection, and not a `CallToolResult`
  `isError`. Only failures *inside* a tool handler (not-found, DB failure)
  return `isError: true` results, per `specs/backend-mcp-server.md`'s error
  table.
- Tools call `FragrancesService`/`VendorsService`/`ListingsService` directly,
  bypassing `FragrancesController`'s admin-only guard (guards attach to
  controllers, not services) — intentional: the MCP catalog reads are public,
  same as the vendors/listings REST reads.
