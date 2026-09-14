import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { DEFAULT_REJECTION_MESSAGE } from './guardrail/prompts.js';
import type { ChatbotConfig, McpServerConfig } from './types.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(
      `La variable de entorno ${name} debe ser un entero positivo, recibió: ${raw}`,
    );
  }
  return parsed;
}

const mcpServerConfigSchema: z.ZodType<McpServerConfig> = z.discriminatedUnion(
  'transport',
  [
    z.object({
      id: z
        .string()
        .min(1)
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          'el id de un servidor MCP no puede contener puntos ni espacios',
        ),
      transport: z.literal('stdio'),
      command: z.string().min(1),
      args: z.array(z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
    }),
    z.object({
      id: z
        .string()
        .min(1)
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          'el id de un servidor MCP no puede contener puntos ni espacios',
        ),
      transport: z.literal('http'),
      url: z.string().url(),
    }),
  ],
);

function loadMcpServers(path: string): McpServerConfig[] {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    throw new Error(
      `No se pudo leer el config de servidores MCP en "${path}": ${(err as Error).message}`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Config de servidores MCP inválido en "${path}": ${(err as Error).message}`,
    );
  }

  const parsed = z.array(mcpServerConfigSchema).safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Config de servidores MCP inválido en "${path}": ${parsed.error.message}`,
    );
  }

  const ids = new Set<string>();
  for (const server of parsed.data) {
    if (ids.has(server.id)) {
      throw new Error(
        `Id de servidor MCP duplicado en "${path}": ${server.id}`,
      );
    }
    ids.add(server.id);
  }

  return parsed.data;
}

export function loadConfig(): ChatbotConfig {
  return {
    geminiApiKey: requireEnv('GEMINI_API_KEY'),
    agentModel: process.env.GEMINI_AGENT_MODEL ?? 'gemini-3.5-flash-lite',
    agentFallbackModel:
      process.env.GEMINI_AGENT_FALLBACK_MODEL ?? 'gemini-3.1-flash-lite',
    classifierModel:
      process.env.GEMINI_CLASSIFIER_MODEL ?? 'gemini-3.5-flash-lite',
    classifierFallbackModel:
      process.env.GEMINI_CLASSIFIER_FALLBACK_MODEL ?? 'gemini-3.1-flash-lite',
    wsHost: process.env.CHATBOT_WS_HOST ?? '0.0.0.0',
    wsPort: intEnv('CHATBOT_WS_PORT', 8081),
    agentHistoryTurns: intEnv('CHATBOT_AGENT_HISTORY_TURNS', 12),
    classifierHistoryTurns: intEnv('CHATBOT_CLASSIFIER_HISTORY_TURNS', 4),
    maxToolIterations: intEnv('CHATBOT_MAX_TOOL_ITERATIONS', 5),
    rejectionMessage:
      process.env.CHATBOT_REJECTION_MESSAGE ?? DEFAULT_REJECTION_MESSAGE,
    mcpServers: loadMcpServers(
      process.env.MCP_CONFIG_PATH ?? './mcp-servers.json',
    ),
  };
}
