import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { loadConfig } from './config.js';
import { log } from './logger.js';
import { McpManager } from './mcp/mcp-manager.js';
import { startWebSocketServer } from './websocket-server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  const mcpManager = new McpManager();
  await mcpManager.connectAll(config.mcpServers);
  if (!mcpManager.hasTools()) {
    log.warn('El agente principal arranca sin ninguna tool MCP disponible.');
  }

  const server = startWebSocketServer(config, ai, mcpManager);
  server.on('listening', () => {
    log.info(
      `chatbot-server escuchando en ws://${config.wsHost}:${config.wsPort}`,
    );
  });
}

main().catch((err) => {
  log.error(`No se pudo arrancar chatbot-server: ${(err as Error).message}`);
  process.exit(1);
});
