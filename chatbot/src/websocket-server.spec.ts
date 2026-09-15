import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, type WebSocketServer } from 'ws';
import type { GoogleGenAI } from '@google/genai';
import type { McpManager } from './mcp/mcp-manager.js';
import type { ChatbotConfig } from './types.js';

vi.mock('./logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { startWebSocketServer } = await import('./websocket-server.js');
const { log } = await import('./logger.js');

// Real `ws` server <-> real `ws` client over a real loopback socket, with a
// fake Gemini client — exercises the protocol/sequencing contract from
// specs/chatbot-server.md ("Protocolo websocket") that only shows up when two
// real components actually talk over the wire (frame ordering, the
// busy-turn rejection racing a second inbound frame), which a fully mocked
// ChatSession would paper over.

function baseConfig(overrides: Partial<ChatbotConfig> = {}): ChatbotConfig {
  return {
    geminiApiKey: 'k',
    agentModel: 'agent-model',
    agentFallbackModel: 'agent-fallback-model',
    classifierModel: 'classifier-model',
    classifierFallbackModel: 'classifier-fallback-model',
    wsHost: '127.0.0.1',
    wsPort: 0,
    agentHistoryTurns: 12,
    classifierHistoryTurns: 4,
    maxToolIterations: 5,
    rejectionMessage: 'fuera de tema',
    mcpServers: [],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function streamOf(chunks: { text: string }[], gate?: Promise<void>) {
  return {
    async *[Symbol.asyncIterator]() {
      if (gate) await gate;
      for (const c of chunks) yield { text: c.text, functionCalls: [] };
    },
  };
}

function rawStreamOf(chunks: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

const fakeMcpManager = {
  getFunctionDeclarations: () => [],
} as unknown as McpManager;

const openServers: WebSocketServer[] = [];
const openSockets: WebSocket[] = [];

beforeEach(() => {
  vi.mocked(log.info).mockClear();
  vi.mocked(log.warn).mockClear();
});

afterEach(async () => {
  for (const s of openSockets.splice(0)) s.close();
  await Promise.all(
    openServers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function startServer(config: ChatbotConfig, ai: GoogleGenAI) {
  const server = startWebSocketServer(config, ai, fakeMcpManager);
  openServers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return port;
}

async function connectClient(port: number): Promise<WebSocket> {
  const client = new WebSocket(`ws://127.0.0.1:${port}`);
  openSockets.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once('open', () => resolve());
    client.once('error', reject);
  });
  return client;
}

function collectFrames(client: WebSocket, count: number): Promise<unknown[]> {
  return new Promise((resolve) => {
    const frames: unknown[] = [];
    client.on('message', (raw) => {
      frames.push(JSON.parse(raw.toString()));
      if (frames.length === count) resolve(frames);
    });
  });
}

describe('websocket-server — malformed/unknown frames', () => {
  it('replies with a protocol error and keeps the connection open for the next message', async () => {
    const generateContent = vi.fn();
    const ai = { models: { generateContent } } as unknown as GoogleGenAI;
    const port = await startServer(baseConfig(), ai);
    const client = await connectClient(port);

    const firstError = collectFrames(client, 1);
    client.send('not json');
    expect(await firstError).toEqual([
      { type: 'error', text: expect.stringContaining('JSON') },
    ]);

    const secondError = collectFrames(client, 1);
    client.send('{"type":"ping"}');
    expect(await secondError).toEqual([
      { type: 'error', text: expect.any(String) },
    ]);

    // Classifier was never reached for either malformed frame.
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects an empty/whitespace-only message before invoking the scope classifier', async () => {
    const generateContent = vi.fn();
    const ai = { models: { generateContent } } as unknown as GoogleGenAI;
    const port = await startServer(baseConfig(), ai);
    const client = await connectClient(port);

    const frames = collectFrames(client, 1);
    client.send(JSON.stringify({ type: 'message', text: '   ' }));
    const [frame] = (await frames) as { type: string; text: string }[];
    expect(frame.type).toBe('error');
    expect(frame.text).toMatch(/vacío/);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('websocket-server — busy-turn sequencing', () => {
  it('rejects a second message while the first turn has not finished, then processes the next one normally', async () => {
    const gate = deferred<void>();
    let streamCall = 0;
    const generateContent = vi.fn(async () => ({ text: '{"in_scope": true}' }));
    const generateContentStream = vi.fn(async () => {
      streamCall++;
      return streamCall === 1
        ? streamOf([{ text: 'primera respuesta' }], gate.promise)
        : streamOf([{ text: 'segunda respuesta' }]);
    });
    const ai = {
      models: { generateContent, generateContentStream },
    } as unknown as GoogleGenAI;
    const port = await startServer(baseConfig(), ai);
    const client = await connectClient(port);

    const busyRejection = collectFrames(client, 1);
    client.send(JSON.stringify({ type: 'message', text: 'primer mensaje' }));
    // Give the classifier microtask a chance to run so the session is `busy`
    // before the second message races in.
    await new Promise((r) => setTimeout(r, 20));
    client.send(JSON.stringify({ type: 'message', text: 'segundo mensaje' }));
    const [rejection] = (await busyRejection) as {
      type: string;
      text: string;
    }[];
    expect(rejection.type).toBe('error');
    expect(rejection.text).toMatch(/en curso/);

    const firstTurnFrames = collectFrames(client, 2); // token + done
    gate.resolve();
    const [tokenFrame, doneFrame] = await firstTurnFrames;
    expect(tokenFrame).toEqual({ type: 'token', text: 'primera respuesta' });
    expect(doneFrame).toEqual({ type: 'done' });

    const thirdTurnFrames = collectFrames(client, 2);
    client.send(JSON.stringify({ type: 'message', text: 'tercer mensaje' }));
    const [thirdToken] = await thirdTurnFrames;
    expect(thirdToken).toEqual({ type: 'token', text: 'segunda respuesta' });
  });
});

describe('websocket-server — full round trips', () => {
  it('in-scope message: streams token frames in order, then done', async () => {
    const generateContent = vi.fn(async () => ({ text: '{"in_scope": true}' }));
    const generateContentStream = vi.fn(async () =>
      streamOf([{ text: 'Hola' }, { text: ' mundo' }]),
    );
    const ai = {
      models: { generateContent, generateContentStream },
    } as unknown as GoogleGenAI;
    const port = await startServer(baseConfig(), ai);
    const client = await connectClient(port);

    const frames = collectFrames(client, 3);
    client.send(JSON.stringify({ type: 'message', text: 'hola' }));
    expect(await frames).toEqual([
      { type: 'token', text: 'Hola' },
      { type: 'token', text: ' mundo' },
      { type: 'done' },
    ]);
  });

  it('out-of-scope message: sends the fixed rejection copy as a token frame, then done, without ever calling generateContentStream', async () => {
    const generateContent = vi.fn(async () => ({
      text: '{"in_scope": false}',
    }));
    const generateContentStream = vi.fn();
    const ai = {
      models: { generateContent, generateContentStream },
    } as unknown as GoogleGenAI;
    const port = await startServer(
      baseConfig({ rejectionMessage: 'fuera de tema, che' }),
      ai,
    );
    const client = await connectClient(port);

    const frames = collectFrames(client, 2);
    client.send(JSON.stringify({ type: 'message', text: '¿lloverá mañana?' }));
    expect(await frames).toEqual([
      { type: 'token', text: 'fuera de tema, che' },
      { type: 'done' },
    ]);
    expect(generateContentStream).not.toHaveBeenCalled();
  });

  it('forwards a mid-turn tool-calling status event as a `status` frame before the final tokens', async () => {
    const generateContent = vi.fn(async () => ({ text: '{"in_scope": true}' }));
    let call = 0;
    const generateContentStream = vi.fn(async () => {
      call++;
      return call === 1
        ? rawStreamOf([
            {
              functionCalls: [{ id: 'c1', name: 'stub.search', args: {} }],
              candidates: [
                {
                  content: {
                    parts: [
                      { functionCall: { id: 'c1', name: 'stub.search' } },
                    ],
                  },
                },
              ],
            },
          ])
        : streamOf([{ text: 'resultado' }]);
    });
    const ai = {
      models: { generateContent, generateContentStream },
    } as unknown as GoogleGenAI;
    const mcpManagerWithTool = {
      getFunctionDeclarations: () => [],
      callTool: vi.fn().mockResolvedValue({ isError: false, payload: [] }),
    } as unknown as McpManager;
    const server = startWebSocketServer(baseConfig(), ai, mcpManagerWithTool);
    openServers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const client = await connectClient(port);

    const frames = collectFrames(client, 3); // status + token + done
    client.send(JSON.stringify({ type: 'message', text: '¿tenés Sauvage?' }));
    expect(await frames).toEqual([
      { type: 'status', text: 'Usando stub.search...' },
      { type: 'token', text: 'resultado' },
      { type: 'done' },
    ]);
  });

  it('surfaces a turn-level Gemini failure as an `error` frame and keeps the connection usable', async () => {
    const generateContent = vi.fn(async () => ({ text: '{"in_scope": true}' }));
    let call = 0;
    // Fails the first two attempts (the primary model call, then its
    // automatic fallback-model retry — see src/gemini/model-fallback.ts) so
    // the turn genuinely errors out, then succeeds from the third call on.
    const generateContentStream = vi.fn(async () => {
      call++;
      if (call <= 2) throw new Error('rate limited');
      return streamOf([{ text: 'ok' }]);
    });
    const ai = {
      models: { generateContent, generateContentStream },
    } as unknown as GoogleGenAI;
    const port = await startServer(baseConfig(), ai);
    const client = await connectClient(port);

    const errorFrames = collectFrames(client, 1);
    client.send(JSON.stringify({ type: 'message', text: 'hola' }));
    const [errorFrame] = (await errorFrames) as {
      type: string;
      text: string;
    }[];
    expect(errorFrame.type).toBe('error');
    expect(errorFrame.text).toMatch(/Falló la llamada a Gemini/);

    // The connection survives a turn-level error — the next message works.
    const nextFrames = collectFrames(client, 2);
    client.send(JSON.stringify({ type: 'message', text: 'otra vez' }));
    expect(await nextFrames).toEqual([
      { type: 'token', text: 'ok' },
      { type: 'done' },
    ]);
  });
});

describe('websocket-server — connection lifecycle', () => {
  it('logs a message on connection open and on close, without throwing', async () => {
    const generateContent = vi.fn();
    const ai = { models: { generateContent } } as unknown as GoogleGenAI;
    const port = await startServer(baseConfig(), ai);
    const client = await connectClient(port);
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('Nueva conexión WS'),
    );

    const closed = new Promise<void>((resolve) =>
      client.once('close', () => resolve()),
    );
    client.close();
    await closed;
    // Give the server's own 'close' handler a tick to run.
    await new Promise((r) => setTimeout(r, 20));
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('Conexión WS cerrada'),
    );
  });

  it("never calls the underlying socket's send() once it is no longer open (send() guard)", async () => {
    const gate = deferred<void>();
    const generateContent = vi.fn(async () => ({ text: '{"in_scope": true}' }));
    const generateContentStream = vi.fn(async () =>
      streamOf([{ text: 'tarde' }], gate.promise),
    );
    const ai = {
      models: { generateContent, generateContentStream },
    } as unknown as GoogleGenAI;
    const port = await startServer(baseConfig(), ai);
    const server = openServers.at(-1)!;
    // Grab the server-side socket for this connection (a 2nd 'connection'
    // listener on the same event still gets the same socket instance) so we
    // can spy on send() directly — ws's own send() on a closed socket fails
    // silently rather than throwing, so asserting "didn't throw" proves
    // nothing; we need to prove send() itself was never invoked.
    const serverSocketReady = new Promise<WebSocket>((resolve) =>
      server.once('connection', (socket) => resolve(socket as WebSocket)),
    );
    const client = await connectClient(port);
    const serverSocket = await serverSocketReady;
    const sendSpy = vi.spyOn(serverSocket, 'send');

    client.send(JSON.stringify({ type: 'message', text: 'hola' }));
    await new Promise((r) => setTimeout(r, 20)); // let the turn start (classifier resolves)
    client.close();
    await new Promise((r) => setTimeout(r, 20)); // let the server observe the close
    sendSpy.mockClear(); // ignore anything sent before the close

    gate.resolve();
    await new Promise((r) => setTimeout(r, 50));

    expect(sendSpy).not.toHaveBeenCalled();
  });
});
