import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_AGENT_MODEL',
  'GEMINI_AGENT_FALLBACK_MODEL',
  'GEMINI_CLASSIFIER_MODEL',
  'GEMINI_CLASSIFIER_FALLBACK_MODEL',
  'CHATBOT_WS_HOST',
  'CHATBOT_WS_PORT',
  'CHATBOT_AGENT_HISTORY_TURNS',
  'CHATBOT_CLASSIFIER_HISTORY_TURNS',
  'CHATBOT_MAX_TOOL_ITERATIONS',
  'CHATBOT_REJECTION_MESSAGE',
  'MCP_CONFIG_PATH',
] as const;

let savedEnv: Record<string, string | undefined>;
let dir: string;
let emptyMcpConfigPath: string;

function writeMcpConfig(content: string): string {
  const path = join(dir, `mcp-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, content);
  return path;
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  dir = mkdtempSync(join(tmpdir(), 'chatbot-config-test-'));
  emptyMcpConfigPath = writeMcpConfig('[]');
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.MCP_CONFIG_PATH = emptyMcpConfigPath;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('loadConfig — GEMINI_API_KEY (requireEnv)', () => {
  it('throws when missing', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => loadConfig()).toThrow(/GEMINI_API_KEY/);
  });

  it('throws when set to whitespace only', () => {
    process.env.GEMINI_API_KEY = '   ';
    expect(() => loadConfig()).toThrow(/GEMINI_API_KEY/);
  });

  it('accepts a non-empty value', () => {
    process.env.GEMINI_API_KEY = 'real-key';
    expect(loadConfig().geminiApiKey).toBe('real-key');
  });
});

describe('loadConfig — defaults', () => {
  it('falls back to documented defaults when optional env vars are unset', () => {
    const config = loadConfig();
    expect(config.agentModel).toBe('gemini-3.5-flash-lite');
    expect(config.agentFallbackModel).toBe('gemini-3.1-flash-lite');
    expect(config.classifierModel).toBe('gemini-3.5-flash-lite');
    expect(config.classifierFallbackModel).toBe('gemini-3.1-flash-lite');
    expect(config.wsHost).toBe('0.0.0.0');
    expect(config.wsPort).toBe(8081);
    expect(config.agentHistoryTurns).toBe(12);
    expect(config.classifierHistoryTurns).toBe(4);
    expect(config.maxToolIterations).toBe(5);
  });

  it('uses explicit overrides instead of defaults when provided', () => {
    process.env.GEMINI_AGENT_MODEL = 'gemini-custom';
    process.env.CHATBOT_WS_HOST = '127.0.0.1';
    process.env.CHATBOT_REJECTION_MESSAGE = 'fuera de tema';
    const config = loadConfig();
    expect(config.agentModel).toBe('gemini-custom');
    expect(config.wsHost).toBe('127.0.0.1');
    expect(config.rejectionMessage).toBe('fuera de tema');
  });
});

describe('loadConfig — intEnv boundaries', () => {
  // BVA: positive integer required; boundary at 1 (min) and 0 (first invalid).
  it.each([
    ['CHATBOT_WS_PORT', '1'],
    ['CHATBOT_AGENT_HISTORY_TURNS', '1'],
    ['CHATBOT_CLASSIFIER_HISTORY_TURNS', '1'],
    ['CHATBOT_MAX_TOOL_ITERATIONS', '1'],
  ])('%s = "1" (boundary) is accepted', (key, value) => {
    process.env[key] = value;
    expect(() => loadConfig()).not.toThrow();
  });

  it.each([
    ['CHATBOT_WS_PORT', '0'],
    ['CHATBOT_AGENT_HISTORY_TURNS', '0'],
    ['CHATBOT_CLASSIFIER_HISTORY_TURNS', '0'],
    ['CHATBOT_MAX_TOOL_ITERATIONS', '0'],
  ])('%s = "0" (boundary) is rejected', (key, value) => {
    process.env[key] = value;
    expect(() => loadConfig()).toThrow(/entero positivo/);
  });

  it('rejects a negative value', () => {
    process.env.CHATBOT_WS_PORT = '-1';
    expect(() => loadConfig()).toThrow(/entero positivo/);
  });

  it('rejects a non-numeric value', () => {
    process.env.CHATBOT_WS_PORT = 'abc';
    expect(() => loadConfig()).toThrow(/entero positivo/);
  });
});

describe('loadConfig — MCP servers list', () => {
  it('accepts a valid stdio server entry', () => {
    process.env.MCP_CONFIG_PATH = writeMcpConfig(
      JSON.stringify([
        { id: 'catalog', transport: 'stdio', command: 'node', args: ['x.js'] },
      ]),
    );
    const config = loadConfig();
    expect(config.mcpServers).toEqual([
      { id: 'catalog', transport: 'stdio', command: 'node', args: ['x.js'] },
    ]);
  });

  it('accepts a valid http server entry', () => {
    process.env.MCP_CONFIG_PATH = writeMcpConfig(
      JSON.stringify([
        { id: 'catalog', transport: 'http', url: 'https://example.com/mcp' },
      ]),
    );
    expect(loadConfig().mcpServers).toHaveLength(1);
  });

  it('rejects an http entry with an invalid url', () => {
    process.env.MCP_CONFIG_PATH = writeMcpConfig(
      JSON.stringify([{ id: 'catalog', transport: 'http', url: 'not-a-url' }]),
    );
    expect(() => loadConfig()).toThrow(/inválido/);
  });

  it('rejects duplicate ids', () => {
    process.env.MCP_CONFIG_PATH = writeMcpConfig(
      JSON.stringify([
        { id: 'catalog', transport: 'stdio', command: 'a' },
        { id: 'catalog', transport: 'stdio', command: 'b' },
      ]),
    );
    expect(() => loadConfig()).toThrow(/duplicado/);
  });

  it('rejects an id containing a dot (namespace-collision guard) on a stdio entry', () => {
    process.env.MCP_CONFIG_PATH = writeMcpConfig(
      JSON.stringify([{ id: 'cat.alog', transport: 'stdio', command: 'a' }]),
    );
    expect(() => loadConfig()).toThrow(/no puede contener puntos ni espacios/);
  });

  // The id regex is declared once per union branch (stdio, http) — a
  // stdio-only test leaves the http branch's copy of the check untested.
  it('rejects an id containing a dot (namespace-collision guard) on an http entry', () => {
    process.env.MCP_CONFIG_PATH = writeMcpConfig(
      JSON.stringify([
        { id: 'cat.alog', transport: 'http', url: 'https://example.com/mcp' },
      ]),
    );
    expect(() => loadConfig()).toThrow(/no puede contener puntos ni espacios/);
  });

  it('accepts an id made only of letters, digits, underscore and dash', () => {
    process.env.MCP_CONFIG_PATH = writeMcpConfig(
      JSON.stringify([
        { id: 'catalog-v2_1', transport: 'stdio', command: 'a' },
      ]),
    );
    expect(() => loadConfig()).not.toThrow();
  });

  it('rejects an unknown transport value', () => {
    process.env.MCP_CONFIG_PATH = writeMcpConfig(
      JSON.stringify([{ id: 'catalog', transport: 'grpc', command: 'a' }]),
    );
    expect(() => loadConfig()).toThrow();
  });

  it('throws a descriptive error when the config file does not exist', () => {
    process.env.MCP_CONFIG_PATH = join(dir, 'missing.json');
    expect(() => loadConfig()).toThrow(/No se pudo leer/);
  });

  // Regression: JSON.parse used to run outside the try/catch, so malformed
  // JSON leaked a raw, unhelpful SyntaxError instead of this message.
  it('throws the friendly "config inválido" message (not a raw SyntaxError) when the file has malformed JSON', () => {
    process.env.MCP_CONFIG_PATH = writeMcpConfig('{ not valid json');
    expect(() => loadConfig()).toThrow(/Config de servidores MCP inválido/);
  });

  it('defaults to an empty list when MCP_CONFIG_PATH is unset and ./mcp-servers.json is the (empty) real file', () => {
    delete process.env.MCP_CONFIG_PATH;
    // loadConfig() resolves relative to process.cwd(); the test runner's cwd
    // is the chatbot/ package root, where the real mcp-servers.json is `[]`.
    expect(loadConfig().mcpServers).toEqual([]);
  });
});
