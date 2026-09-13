import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServerConfig } from '../types.js';

const connect = vi.fn();
const listTools = vi.fn();
const callTool = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  // `new Client(...)` requires a real constructor function — an arrow
  // function can't be invoked with `new` and vi.fn() silently no-ops it.
  Client: vi.fn().mockImplementation(function FakeClient() {
    return { connect, listTools, callTool };
  }),
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(),
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));
vi.mock('../logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { McpManager } = await import('./mcp-manager.js');
const { log } = await import('../logger.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } =
  await import('@modelcontextprotocol/sdk/client/stdio.js');
const { StreamableHTTPClientTransport } =
  await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

const stdioConfig = (id: string): McpServerConfig => ({
  id,
  transport: 'stdio',
  command: 'node',
  args: ['server.js'],
});

beforeEach(() => {
  connect.mockReset().mockResolvedValue(undefined);
  listTools.mockReset().mockResolvedValue({ tools: [] });
  callTool.mockReset();
  vi.mocked(log.warn).mockClear();
  vi.mocked(log.info).mockClear();
  vi.mocked(Client).mockClear();
  vi.mocked(StdioClientTransport).mockClear();
  vi.mocked(StreamableHTTPClientTransport).mockClear();
});

describe('McpManager.connectAll', () => {
  it("namespaces a connected server's tools as `<serverId>.<toolName>`", async () => {
    listTools.mockResolvedValue({
      tools: [
        { name: 'search_fragrance', description: 'desc', inputSchema: {} },
      ],
    });
    const manager = new McpManager();
    await manager.connectAll([stdioConfig('catalog')]);
    const decls = manager.getFunctionDeclarations();
    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe('catalog.search_fragrance');
    expect(decls[0].description).toBe('desc');
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('"catalog" conectado (1 tool(s))'),
    );
  });

  it('identifies itself to the MCP server with a fixed client name/version', async () => {
    const manager = new McpManager();
    await manager.connectAll([stdioConfig('catalog')]);
    expect(Client).toHaveBeenCalledWith({
      name: 'chatbot-server',
      version: '0.0.1',
    });
  });

  it('builds a StdioClientTransport for a stdio config and a StreamableHTTPClientTransport for an http config', async () => {
    const manager = new McpManager();
    await manager.connectAll([
      stdioConfig('a'),
      { id: 'b', transport: 'http', url: 'https://example.com/mcp' },
    ]);
    expect(StdioClientTransport).toHaveBeenCalledWith({
      command: 'node',
      args: ['server.js'],
      env: undefined,
    });
    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
      new URL('https://example.com/mcp'),
    );
  });

  it('excludes a server that fails to connect, without aborting the others', async () => {
    connect
      .mockRejectedValueOnce(new Error('conexión rechazada'))
      .mockResolvedValueOnce(undefined);
    // `listTools` is only ever reached for a server whose `connect` resolved
    // — the broken server's connect() throws before listTools is called, so
    // only one resolved value is queued here (for "ok").
    listTools.mockResolvedValueOnce({
      tools: [{ name: 'get_listings', inputSchema: {} }],
    });
    const manager = new McpManager();
    await manager.connectAll([stdioConfig('broken'), stdioConfig('ok')]);
    const decls = manager.getFunctionDeclarations();
    expect(decls.map((d) => d.name)).toEqual(['ok.get_listings']);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('broken'));
  });

  it('hasTools() is false when every configured server fails', async () => {
    connect.mockRejectedValue(new Error('down'));
    const manager = new McpManager();
    await manager.connectAll([stdioConfig('a'), stdioConfig('b')]);
    expect(manager.hasTools()).toBe(false);
  });

  it('hasTools() is true when at least one server contributes a tool', async () => {
    listTools.mockResolvedValue({ tools: [{ name: 't', inputSchema: {} }] });
    const manager = new McpManager();
    await manager.connectAll([stdioConfig('a')]);
    expect(manager.hasTools()).toBe(true);
  });

  it('connectAll([]) results in no tools and does not throw', async () => {
    const manager = new McpManager();
    await expect(manager.connectAll([])).resolves.toBeUndefined();
    expect(manager.hasTools()).toBe(false);
  });
});

describe('McpManager.callTool', () => {
  it('returns an error outcome for an unknown namespaced tool name', async () => {
    const manager = new McpManager();
    await manager.connectAll([]);
    const outcome = await manager.callTool('nope.tool', {});
    expect(outcome).toEqual({
      isError: true,
      payload: 'Tool desconocida: nope.tool',
    });
  });

  it('dispatches to the right underlying server and returns its content on success', async () => {
    listTools.mockResolvedValue({
      tools: [{ name: 'search_fragrance', inputSchema: {} }],
    });
    callTool.mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: '[]' }],
    });
    const manager = new McpManager();
    await manager.connectAll([stdioConfig('catalog')]);
    const outcome = await manager.callTool('catalog.search_fragrance', {
      query: 'sauvage',
    });
    expect(outcome).toEqual({
      isError: false,
      payload: [{ type: 'text', text: '[]' }],
    });
    expect(callTool).toHaveBeenCalledWith({
      name: 'search_fragrance',
      arguments: { query: 'sauvage' },
    });
  });

  it('surfaces an MCP-reported tool error as isError:true', async () => {
    listTools.mockResolvedValue({ tools: [{ name: 't', inputSchema: {} }] });
    callTool.mockResolvedValue({ isError: true, content: 'boom' });
    const manager = new McpManager();
    await manager.connectAll([stdioConfig('s')]);
    const outcome = await manager.callTool('s.t', {});
    expect(outcome).toEqual({ isError: true, payload: 'boom' });
  });

  it('catches a thrown/rejected tools/call (e.g. crash mid-session) as an error outcome, not an exception', async () => {
    listTools.mockResolvedValue({ tools: [{ name: 't', inputSchema: {} }] });
    callTool.mockRejectedValue(new Error('timeout'));
    const manager = new McpManager();
    await manager.connectAll([stdioConfig('s')]);
    const outcome = await manager.callTool('s.t', {});
    expect(outcome.isError).toBe(true);
    expect(outcome.payload).toContain('s.t');
    expect(outcome.payload).toContain('timeout');
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Falló tools/call "s.t"'),
    );
  });
});
