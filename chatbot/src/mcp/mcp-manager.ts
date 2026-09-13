import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { FunctionDeclaration } from '@google/genai';
import { log } from '../logger.js';
import type { McpServerConfig } from '../types.js';

export type McpToolCallOutcome = {
  isError: boolean;
  /** Serializable payload — the MCP `content` array on success, an error message on failure. */
  payload: unknown;
};

type RegisteredTool = {
  serverId: string;
  /** Tool name as the MCP server knows it, without the `<serverId>.` namespace prefix. */
  rawName: string;
  description?: string;
  inputSchema: unknown;
};

function buildTransport(config: McpServerConfig): Transport {
  if (config.transport === 'stdio') {
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });
  }
  return new StreamableHTTPClientTransport(new URL(config.url));
}

/**
 * Connects to every configured MCP server, aggregates their tools into a
 * single Gemini-ready catalog namespaced by server id (`<serverId>.<toolName>`,
 * per specs/chatbot-server.md "Registro modular de tools multi-MCP"), and
 * dispatches `tools/call` back to the right server by that prefix.
 *
 * Adding/removing an MCP server is purely a config change (mcp-servers.json) —
 * this class has no per-server-specific code.
 */
export class McpManager {
  private readonly clients = new Map<string, Client>();
  private readonly tools = new Map<string, RegisteredTool>();

  async connectAll(configs: McpServerConfig[]): Promise<void> {
    for (const config of configs) {
      try {
        const client = new Client({ name: 'chatbot-server', version: '0.0.1' });
        await client.connect(buildTransport(config));
        const { tools } = await client.listTools();

        for (const tool of tools) {
          this.tools.set(`${config.id}.${tool.name}`, {
            serverId: config.id,
            rawName: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          });
        }

        this.clients.set(config.id, client);
        log.info(
          `Servidor MCP "${config.id}" conectado (${tools.length} tool(s)).`,
        );
      } catch (err) {
        // Per spec: a broken MCP server at startup is excluded from this
        // session's tool catalog, it must not abort the whole process nor
        // hide the other configured servers' tools.
        log.warn(
          `Servidor MCP "${config.id}" no disponible al arrancar, se excluye del catálogo: ${(err as Error).message}`,
        );
      }
    }
  }

  getFunctionDeclarations(): FunctionDeclaration[] {
    return [...this.tools.entries()].map(([name, tool]) => ({
      name,
      description: tool.description,
      parametersJsonSchema: tool.inputSchema,
    }));
  }

  hasTools(): boolean {
    return this.tools.size > 0;
  }

  async callTool(
    namespacedName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallOutcome> {
    const tool = this.tools.get(namespacedName);
    if (!tool) {
      return { isError: true, payload: `Tool desconocida: ${namespacedName}` };
    }

    const client = this.clients.get(tool.serverId);
    if (!client) {
      return {
        isError: true,
        payload: `Servidor MCP "${tool.serverId}" no está conectado.`,
      };
    }

    try {
      const result = await client.callTool({
        name: tool.rawName,
        arguments: args,
      });
      if (result.isError) {
        return { isError: true, payload: result.content };
      }
      return { isError: false, payload: result.content };
    } catch (err) {
      // Per spec: a tool failing/timing out mid-session must not crash the
      // WS connection — it becomes an error result handed back to Gemini.
      log.warn(
        `Falló tools/call "${namespacedName}": ${(err as Error).message}`,
      );
      return {
        isError: true,
        payload: `No se pudo ejecutar "${namespacedName}": ${(err as Error).message}`,
      };
    }
  }
}
