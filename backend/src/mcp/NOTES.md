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
- **Input validation is two-layered**: the wire-level `inputSchema` stays
  zod-only per `specs/backend-mcp-server.md` (input/output declared by JSON
  schema, not `class-validator`-bound DTOs) — the MCP tool boundary never
  goes through Nest's HTTP layer (global `ValidationPipe`/
  `customValidationPipe`), and a schema-shape error (bad UUID, wrong type)
  is reported as a normal `CallToolResult` with `isError: true` — the MCP
  SDK's own `McpServer.callTool` handler (`server/mcp.js`) catches the
  `McpError` thrown by its zod validation step and wraps it via
  `createToolError` before it ever reaches the JSON-RPC transport layer, so
  it never surfaces as a protocol-level error or a crash of the connection.
  Confirmed by testing directly against the installed SDK
  (`@modelcontextprotocol/sdk@1.30.0`) — see
  `tools/register-catalog-tools.spec.ts`. **On top of that**, any tool
  handler that builds a `find`-style DTO from raw args now also runs it
  through `tools/validate-dto-input.ts` (`plainToInstance` +
  `class-validator`'s standalone `validate()`) before calling the service —
  security-hardening finding: these handlers used to do
  `Object.assign(new XDto(), args)`, which skips every `class-validator`
  decorator, leaving zod's (looser) types as the only check. Concrete gap
  this closed: zod's `.uuid()` accepts any RFC4122 UUID version, but
  `FindListingsDto.fragranceId`'s `@IsUUID('4')` only accepts v4 — a
  well-formed v1 UUID passed zod and reached the DB query unvalidated by
  the DTO. `get_cheapest_listing` builds its `FindListingsDto` from an
  already-validated `fragranceId` plus internal constants (not raw args),
  so it's left on `Object.assign` — nothing user-controlled bypasses
  validation there. Failures *inside* a tool handler (not-found, DB
  failure) return `isError: true` results the same way, per
  `specs/backend-mcp-server.md`'s error table.
- Tools call `FragrancesService`/`VendorsService`/`ListingsService` directly,
  bypassing `FragrancesController`'s admin-only guard (guards attach to
  controllers, not services) — intentional: the MCP catalog reads are public,
  same as the vendors/listings REST reads.
