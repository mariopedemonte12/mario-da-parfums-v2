import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import type { McpManager } from '../mcp/mcp-manager.js';

vi.mock('../logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { runTurn } = await import('./chat-agent.js');
const { log } = await import('../logger.js');
const { PRESENT_FRAGRANCES_TOOL, PRESENT_FRAGRANCES_TOOL_NAME } =
  await import('./present-fragrances-tool.js');

type Chunk = {
  text?: string;
  functionCalls?: {
    id?: string;
    name: string;
    args?: Record<string, unknown>;
  }[];
  candidates?: { content: { parts: unknown[] } }[];
};

function streamOf(chunks: Chunk[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

function fakeAi(
  impl: (call: number) => Chunk[] | (() => AsyncIterable<Chunk>),
): { ai: GoogleGenAI; generateContentStream: ReturnType<typeof vi.fn> } {
  let call = 0;
  const generateContentStream = vi.fn(async () => {
    const result = impl(call++);
    return typeof result === 'function' ? result() : streamOf(result);
  });
  return {
    ai: { models: { generateContentStream } } as unknown as GoogleGenAI,
    generateContentStream,
  };
}

function textChunk(text: string): Chunk {
  return { text, candidates: [{ content: { parts: [{ text }] } }] };
}

function fnCallChunk(
  name: string,
  id?: string,
  args: Record<string, unknown> = {},
): Chunk {
  return {
    functionCalls: [{ id, name, args }],
    candidates: [
      { content: { parts: [{ functionCall: { id, name, args } }] } },
    ],
  };
}

function baseParams(
  overrides: Partial<Parameters<typeof runTurn>[0]> & { ai: GoogleGenAI },
): Parameters<typeof runTurn>[0] {
  return {
    model: 'test-model',
    history: [],
    userText: 'hola',
    tools: [],
    maxIterations: 5,
    onStatus: vi.fn(),
    onToken: vi.fn(),
    onFragrances: vi.fn(),
    mcpManager: { callTool: vi.fn() } as unknown as McpManager,
    ...overrides,
  };
}

describe('runTurn — plain text answer, no tools', () => {
  beforeEach(() => {
    vi.mocked(log.warn).mockClear();
  });

  it('streams each text chunk via onToken and returns ok:true with the concatenated final text', async () => {
    const { ai } = fakeAi(() => [textChunk('Hola'), textChunk(' mundo')]);
    const onToken = vi.fn();
    const result = await runTurn(baseParams({ ai, onToken }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.finalText).toBe('Hola mundo');
    expect(onToken.mock.calls.map((c) => c[0])).toEqual(['Hola', ' mundo']);
  });

  it('appends the user message and the final model turn to newContents', async () => {
    const { ai } = fakeAi(() => [textChunk('ok')]);
    const result = await runTurn(baseParams({ ai, userText: 'pregunta' }));
    expect(result.newContents[0]).toEqual({
      role: 'user',
      parts: [{ text: 'pregunta' }],
    });
    expect(result.newContents.at(-1)).toEqual({
      role: 'model',
      parts: [{ text: 'ok' }],
    });
  });

  it('preserves the full candidate parts array (not a text-only reconstruction) in the final model turn', async () => {
    const { ai } = fakeAi(() => [
      {
        text: 'hola',
        candidates: [
          {
            content: {
              parts: [{ text: 'hola' }, { thoughtSignature: 'abc123' }],
            },
          },
        ],
      },
    ]);
    const result = await runTurn(baseParams({ ai }));
    expect(result.newContents.at(-1)).toEqual({
      role: 'model',
      parts: [{ text: 'hola' }, { thoughtSignature: 'abc123' }],
    });
  });

  it('falls back to a synthesized {text: finalText} part when the response carries no candidates at all', async () => {
    const { ai } = fakeAi(() => [{ text: 'solo texto, sin candidates' }]);
    const result = await runTurn(baseParams({ ai }));
    expect(result.newContents.at(-1)).toEqual({
      role: 'model',
      parts: [{ text: 'solo texto, sin candidates' }],
    });
  });

  it('tolerates a candidate whose `content` is missing (optional chaining, not a hard crash)', async () => {
    const { ai } = fakeAi(() => [
      { text: 'ok', candidates: [{}] } as unknown as Chunk,
    ]);
    const result = await runTurn(baseParams({ ai }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.finalText).toBe('ok');
  });
});

describe('runTurn — tool calling loop', () => {
  it('executes a function_call via mcpManager, feeds the result back, and returns the following plain-text answer', async () => {
    const { ai, generateContentStream } = fakeAi((call) =>
      call === 0
        ? [fnCallChunk('catalog.get_listings', 'call-1', { name: 'Sauvage' })]
        : [textChunk('Cuesta $81.990')],
    );
    const callTool = vi.fn().mockResolvedValue({
      isError: false,
      payload: [{ vendor: 'AromaChile' }],
    });
    const onStatus = vi.fn();
    const result = await runTurn(
      baseParams({
        ai,
        onStatus,
        mcpManager: { callTool } as unknown as McpManager,
      }),
    );

    expect(callTool).toHaveBeenCalledWith('catalog.get_listings', {
      name: 'Sauvage',
    });
    expect(onStatus).toHaveBeenCalledWith('Usando catalog.get_listings...');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.finalText).toBe('Cuesta $81.990');

    // The function_call itself must be recorded verbatim as the model turn...
    expect(result.newContents[1]).toEqual({
      role: 'model',
      parts: [
        {
          functionCall: {
            id: 'call-1',
            name: 'catalog.get_listings',
            args: { name: 'Sauvage' },
          },
        },
      ],
    });
    // ...and a successful tool result must be wrapped as {output: ...}
    // (not {error: ...}) when handed back to Gemini.
    const secondCallArgs = generateContentStream.mock.calls[1][0] as {
      contents: { parts: { functionResponse?: { response: unknown } }[] }[];
    };
    expect(
      secondCallArgs.contents.at(-1)?.parts[0]?.functionResponse?.response,
    ).toEqual({ output: [{ vendor: 'AromaChile' }] });
  });

  it('skips a function-call entry with no name and still dispatches the others in the same chunk', async () => {
    const { ai } = fakeAi((call) =>
      call === 0
        ? [
            {
              functionCalls: [
                { id: 'x', name: '', args: {} },
                { id: 'y', name: 'catalog.search', args: {} },
              ],
              candidates: [],
            },
          ]
        : [textChunk('ok')],
    );
    const callTool = vi.fn().mockResolvedValue({ isError: false, payload: [] });
    await runTurn(
      baseParams({ ai, mcpManager: { callTool } as unknown as McpManager }),
    );
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith('catalog.search', {});
  });

  it('feeds a tool error back to Gemini as {error: ...} instead of throwing', async () => {
    const { ai, generateContentStream } = fakeAi((call) =>
      call === 0
        ? [fnCallChunk('catalog.get_listings', 'c1')]
        : [textChunk('no pude')],
    );
    const callTool = vi
      .fn()
      .mockResolvedValue({ isError: true, payload: 'servidor caído' });
    await runTurn(
      baseParams({ ai, mcpManager: { callTool } as unknown as McpManager }),
    );

    const secondCallArgs = generateContentStream.mock.calls[1][0] as {
      contents: {
        role: string;
        parts: { functionResponse?: { response: unknown } }[];
      }[];
    };
    const functionResponseContent = secondCallArgs.contents.at(-1);
    expect(functionResponseContent?.role).toBe('user');
    const responsePart = functionResponseContent?.parts[0];
    expect(responsePart?.functionResponse?.response).toEqual({
      error: 'servidor caído',
    });
  });

  it('falls back to the tool name as function_response id when Gemini omits call.id', async () => {
    const { ai, generateContentStream } = fakeAi((call) =>
      call === 0
        ? [fnCallChunk('catalog.search', undefined)]
        : [textChunk('ok')],
    );
    const callTool = vi.fn().mockResolvedValue({ isError: false, payload: [] });
    await runTurn(
      baseParams({ ai, mcpManager: { callTool } as unknown as McpManager }),
    );

    const secondCallArgs = generateContentStream.mock.calls[1][0] as {
      contents: {
        parts: { functionResponse?: { id?: string; name: string } }[];
      }[];
    };
    const responsePart = secondCallArgs.contents.at(-1)?.parts[0];
    expect(responsePart?.functionResponse?.id).toBe('catalog.search');
  });

  it('stops after maxIterations and returns a turn-level error instead of looping forever', async () => {
    const { ai } = fakeAi((n) => [
      fnCallChunk('catalog.search', `x${n}`, { q: n }),
    ]);
    const callTool = vi.fn().mockResolvedValue({ isError: false, payload: [] });
    const result = await runTurn(
      baseParams({
        ai,
        maxIterations: 3,
        mcpManager: { callTool } as unknown as McpManager,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/límite de pasos/);
    expect(callTool).toHaveBeenCalledTimes(3);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('límite de iteraciones'),
    );
  });

  // NOTES.md: text arriving in the same chunk as a function_call is streamed
  // live, not buffered/suppressed — a deliberate bet, tested here to lock in
  // the documented current behavior.
  it('streams narration text that arrives alongside a function_call in the same iteration (documented behavior, not a bug)', async () => {
    const { ai } = fakeAi((call) =>
      call === 0
        ? [
            {
              text: 'Buscando...',
              functionCalls: [{ id: 'c1', name: 'catalog.search', args: {} }],
              candidates: [
                {
                  content: {
                    parts: [
                      { text: 'Buscando...' },
                      { functionCall: { id: 'c1', name: 'catalog.search' } },
                    ],
                  },
                },
              ],
            },
          ]
        : [textChunk('resultado final')],
    );
    const callTool = vi.fn().mockResolvedValue({ isError: false, payload: [] });
    const onToken = vi.fn();
    await runTurn(
      baseParams({
        ai,
        onToken,
        mcpManager: { callTool } as unknown as McpManager,
      }),
    );
    expect(onToken).toHaveBeenCalledWith('Buscando...');
  });
});

describe('runTurn — Gemini call failures', () => {
  it('returns ok:false when generateContentStream itself rejects', async () => {
    const ai = {
      models: {
        generateContentStream: vi
          .fn()
          .mockRejectedValue(new Error('network down')),
      },
    } as unknown as GoogleGenAI;
    const result = await runTurn(baseParams({ ai }));
    expect(result.ok).toBe(false);
    // Checking the original error text (not just the generic prefix) proves
    // this specific catch block ran, rather than a *different* downstream
    // catch (e.g. one triggered by iterating an undefined stream) coincidentally
    // producing a similarly-shaped error.
    if (!result.ok) {
      expect(result.error).toMatch(/Falló la llamada a Gemini/);
      expect(result.error).toContain('network down');
    }
  });

  it('returns ok:false when the stream throws mid-iteration', async () => {
    const ai = {
      models: {
        generateContentStream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield textChunk('parcial');
            throw new Error('conexión perdida');
          },
        }),
      },
    } as unknown as GoogleGenAI;
    const result = await runTurn(baseParams({ ai }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Falló la llamada a Gemini/);
  });

  it('preserves newContents accumulated before the failure (partial history is not discarded)', async () => {
    const callTool = vi.fn().mockResolvedValue({ isError: false, payload: [] });
    // Force the second generateContentStream call to reject.
    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(streamOf([fnCallChunk('catalog.search', 'c1')]))
      .mockRejectedValueOnce(new Error('boom'));
    const failingAi = {
      models: { generateContentStream },
    } as unknown as GoogleGenAI;
    const result = await runTurn(
      baseParams({
        ai: failingAi,
        mcpManager: { callTool } as unknown as McpManager,
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.newContents.length).toBeGreaterThan(1);
  });
});

describe('runTurn — tool declarations passed to Gemini', () => {
  it('always offers the local present_fragrances tool, even with zero MCP tools available', async () => {
    const { ai, generateContentStream } = fakeAi(() => [textChunk('ok')]);
    await runTurn(baseParams({ ai, tools: [] }));
    const call = generateContentStream.mock.calls[0][0] as {
      config: { tools?: { functionDeclarations: unknown }[] };
    };
    expect(call.config.tools).toEqual([
      { functionDeclarations: [PRESENT_FRAGRANCES_TOOL] },
    ]);
  });

  it('passes MCP tool declarations under functionDeclarations alongside present_fragrances', async () => {
    const { ai, generateContentStream } = fakeAi(() => [textChunk('ok')]);
    const tools = [{ name: 'catalog.search', description: 'x' }];
    await runTurn(baseParams({ ai, tools: tools as never }));
    const call = generateContentStream.mock.calls[0][0] as {
      config: { tools?: { functionDeclarations: unknown }[] };
    };
    expect(call.config.tools).toEqual([
      { functionDeclarations: [...tools, PRESENT_FRAGRANCES_TOOL] },
    ]);
  });
});

describe('runTurn — present_fragrances (local presentation tool)', () => {
  it('intercepts a present_fragrances call without dispatching it through mcpManager, and reports it via onFragrances', async () => {
    const item = {
      id: 'f1',
      name: 'Sauvage',
      brand: 'Dior',
      price: 81990,
      imageUrl: null,
    };
    const { ai } = fakeAi((call) =>
      call === 0
        ? [fnCallChunk(PRESENT_FRAGRANCES_TOOL_NAME, 'c1', { items: [item] })]
        : [textChunk('Te recomiendo Sauvage.')],
    );
    const callTool = vi.fn();
    const onFragrances = vi.fn();
    const result = await runTurn(
      baseParams({
        ai,
        onFragrances,
        mcpManager: { callTool } as unknown as McpManager,
      }),
    );

    expect(callTool).not.toHaveBeenCalled();
    expect(onFragrances).toHaveBeenCalledWith([item]);
    expect(result.ok).toBe(true);
  });

  it('feeds an error back to Gemini instead of throwing when present_fragrances args fail validation', async () => {
    const { ai, generateContentStream } = fakeAi((call) =>
      call === 0
        ? [fnCallChunk(PRESENT_FRAGRANCES_TOOL_NAME, 'c1', { items: [] })]
        : [textChunk('ok')],
    );
    const onFragrances = vi.fn();
    const result = await runTurn(baseParams({ ai, onFragrances }));

    expect(onFragrances).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    const secondCallArgs = generateContentStream.mock.calls[1][0] as {
      contents: { parts: { functionResponse?: { response: unknown } }[] }[];
    };
    expect(
      secondCallArgs.contents.at(-1)?.parts[0]?.functionResponse?.response,
    ).toEqual({ error: 'Argumentos inválidos para present_fragrances.' });
  });
});

describe('runTurn — per-turn memoization of identical tool calls', () => {
  it('does not call the MCP server twice for the same tool + args (key order irrelevant)', async () => {
    const { ai } = fakeAi((n) =>
      n === 0
        ? [fnCallChunk('catalog.search', 'a', { q: 'sauvage', limit: 3 })]
        : n === 1
          ? [fnCallChunk('catalog.search', 'b', { limit: 3, q: 'sauvage' })]
          : [textChunk('listo')],
    );
    const callTool = vi
      .fn()
      .mockResolvedValue({ isError: false, payload: [{ id: '1' }] });
    const onStatus = vi.fn();
    const result = await runTurn(
      baseParams({
        ai,
        onStatus,
        mcpManager: { callTool } as unknown as McpManager,
      }),
    );
    expect(result.ok).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledTimes(1);
    // the model still receives a response for the repeated call
    const parts = result.newContents
      .flatMap((c) => c.parts ?? [])
      .filter((p) => p.functionResponse);
    expect(parts).toHaveLength(2);
    expect(parts[1].functionResponse?.response).toEqual({
      output: [{ id: '1' }],
    });
  });

  it('calls again when the args differ or the tool differs', async () => {
    const { ai } = fakeAi((n) =>
      n === 0
        ? [fnCallChunk('catalog.search', 'a', { q: 'x' })]
        : n === 1
          ? [fnCallChunk('catalog.search', 'b', { q: 'y' })]
          : n === 2
            ? [fnCallChunk('catalog.other', 'c', { q: 'x' })]
            : [textChunk('listo')],
    );
    const callTool = vi.fn().mockResolvedValue({ isError: false, payload: [] });
    await runTurn(
      baseParams({ ai, mcpManager: { callTool } as unknown as McpManager }),
    );
    expect(callTool).toHaveBeenCalledTimes(3);
  });

  it('does not cache error results (a retry hits the server again)', async () => {
    const { ai } = fakeAi((n) =>
      n < 2
        ? [fnCallChunk('catalog.search', `e${n}`, { q: 'x' })]
        : [textChunk('ok')],
    );
    const callTool = vi
      .fn()
      .mockResolvedValue({ isError: true, payload: 'boom' });
    await runTurn(
      baseParams({ ai, mcpManager: { callTool } as unknown as McpManager }),
    );
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it('does not share the cache across turns', async () => {
    const callTool = vi.fn().mockResolvedValue({ isError: false, payload: [] });
    for (let turn = 0; turn < 2; turn++) {
      const { ai } = fakeAi((n) =>
        n === 0
          ? [fnCallChunk('catalog.search', 'a', { q: 'x' })]
          : [textChunk('ok')],
      );
      await runTurn(
        baseParams({ ai, mcpManager: { callTool } as unknown as McpManager }),
      );
    }
    expect(callTool).toHaveBeenCalledTimes(2);
  });
});
