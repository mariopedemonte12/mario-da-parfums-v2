import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import type { McpManager } from './mcp/mcp-manager.js';
import type { ChatbotConfig } from './types.js';

const classifyScope = vi.fn();
const runTurn = vi.fn();

vi.mock('./guardrail/scope-classifier.js', () => ({ classifyScope }));
vi.mock('./agent/chat-agent.js', () => ({ runTurn }));
vi.mock('./logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { ChatSession } = await import('./session.js');
const { log } = await import('./logger.js');

function config(overrides: Partial<ChatbotConfig> = {}): ChatbotConfig {
  return {
    geminiApiKey: 'k',
    agentModel: 'agent-model',
    agentFallbackModel: 'agent-fallback-model',
    classifierModel: 'classifier-model',
    classifierFallbackModel: 'classifier-fallback-model',
    wsHost: '0.0.0.0',
    wsPort: 8081,
    agentHistoryTurns: 12,
    classifierHistoryTurns: 4,
    maxToolIterations: 5,
    rejectionMessage: 'fuera de tema',
    mcpServers: [],
    ...overrides,
  };
}

function callbacks() {
  return {
    onStatus: vi.fn(),
    onToken: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
}

const fakeAi = {} as GoogleGenAI;
const fakeMcpManager = {
  getFunctionDeclarations: () => [],
} as unknown as McpManager;

beforeEach(() => {
  classifyScope.mockReset();
  runTurn.mockReset();
});

describe('ChatSession — guardrail gating', () => {
  it('out-of-scope: sends the fixed rejection copy, calls onDone, and never invokes the agent', async () => {
    classifyScope.mockResolvedValue(false);
    const session = new ChatSession(fakeAi, fakeMcpManager, config());
    const cb = callbacks();
    await session.handleUserMessage('clima de mañana', cb);

    expect(runTurn).not.toHaveBeenCalled();
    expect(cb.onToken).toHaveBeenCalledWith('fuera de tema');
    expect(cb.onDone).toHaveBeenCalledOnce();
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('out-of-scope: records the rejection turn (user text + actual rejection copy) in classifier history, and it is still truncated by whole turns', async () => {
    classifyScope.mockResolvedValue(false);
    const histories: unknown[][] = [];
    classifyScope.mockImplementation(async (_ai, _model, history) => {
      histories.push(structuredClone(history));
      return false;
    });
    const session = new ChatSession(
      fakeAi,
      fakeMcpManager,
      config({
        classifierHistoryTurns: 1,
        rejectionMessage: 'no puedo con eso',
      }),
    );
    const cb = callbacks();

    await session.handleUserMessage('clima de mañana', cb);
    await session.handleUserMessage('el dólar hoy', cb);
    await session.handleUserMessage('ayuda con python', cb);

    // The 2nd call sees the 1st rejection turn recorded with its real text...
    expect(histories[1]).toEqual([
      { userText: 'clima de mañana', assistantText: 'no puedo con eso' },
    ]);
    // ...and it keeps getting truncated to 1 turn even on this all-rejection
    // path (not just on the in-scope path truncateAgentHistory covers).
    expect(histories[2]).toEqual([
      { userText: 'el dólar hoy', assistantText: 'no puedo con eso' },
    ]);
  });

  it('in-scope: forwards the message to runTurn with the agent config', async () => {
    classifyScope.mockResolvedValue(true);
    runTurn.mockResolvedValue({
      ok: true,
      newContents: [{ role: 'user', parts: [{ text: 'x' }] }],
      finalText: 'respuesta',
    });
    const session = new ChatSession(fakeAi, fakeMcpManager, config());
    const cb = callbacks();
    await session.handleUserMessage('¿precio de Sauvage?', cb);

    expect(runTurn).toHaveBeenCalledOnce();
    const args = runTurn.mock.calls[0][0];
    expect(args.userText).toBe('¿precio de Sauvage?');
    expect(args.model).toBe('agent-model');
    expect(args.maxIterations).toBe(5);
    expect(cb.onDone).toHaveBeenCalledOnce();
    expect(cb.onError).not.toHaveBeenCalled();
  });
});

describe('ChatSession — agent turn outcomes', () => {
  it('ok:true — appends the turn to agent history and reports the final text to the classifier history, then onDone', async () => {
    runTurn.mockResolvedValue({
      ok: true,
      newContents: [{ role: 'user', parts: [{ text: 'x' }] }],
      finalText: 'respuesta final',
    });
    const session = new ChatSession(fakeAi, fakeMcpManager, config());
    const cb = callbacks();
    // `this.classifierTurns` is mutated in place (push) before any
    // conditional reassignment on truncation, so `classifyScope.mock.calls`
    // would alias later mutations — capture a clone at call time instead.
    const histories: unknown[][] = [];
    classifyScope.mockImplementation(async (_ai, _model, history) => {
      histories.push(structuredClone(history));
      return true;
    });
    await session.handleUserMessage('hola', cb);
    expect(cb.onDone).toHaveBeenCalledOnce();
    expect(cb.onError).not.toHaveBeenCalled();

    // The next classifyScope call should see this turn in its history.
    runTurn.mockResolvedValue({ ok: true, newContents: [], finalText: 'y' });
    await session.handleUserMessage('siguiente', cb);
    expect(histories[1]).toEqual([
      { userText: 'hola', assistantText: 'respuesta final' },
    ]);
  });

  it('ok:false with newContents — keeps the partial agent history but does NOT record it in classifier history, and calls onError', async () => {
    const histories: unknown[][] = [];
    classifyScope.mockImplementation(async (_ai, _model, history) => {
      histories.push(structuredClone(history));
      return true;
    });
    runTurn.mockResolvedValue({
      ok: false,
      newContents: [{ role: 'user', parts: [{ text: 'x' }] }],
      error: 'se cortó el ciclo',
    });
    const session = new ChatSession(fakeAi, fakeMcpManager, config());
    const cb = callbacks();
    await session.handleUserMessage('pregunta difícil', cb);

    expect(cb.onError).toHaveBeenCalledWith('se cortó el ciclo');
    expect(cb.onDone).not.toHaveBeenCalled();

    // Confirm the failed turn is absent from classifier history (only agent
    // history keeps the partial function_call/response pairs).
    runTurn.mockResolvedValue({ ok: true, newContents: [], finalText: 'z' });
    await session.handleUserMessage('otra', cb);
    expect(histories[1]).toEqual([]);

    // But the agent history did receive the partial turn's contents.
    const agentHistoryArg = runTurn.mock.calls[1][0].history;
    expect(agentHistoryArg).toEqual([{ role: 'user', parts: [{ text: 'x' }] }]);
  });

  it('an unexpected exception (e.g. classifyScope rejects) is caught, reported via onError, and does not leave the session stuck busy', async () => {
    classifyScope.mockRejectedValue(new Error('boom inesperado'));
    const session = new ChatSession(fakeAi, fakeMcpManager, config());
    const cb = callbacks();
    await session.handleUserMessage('hola', cb);

    expect(cb.onError).toHaveBeenCalledWith(
      'Ocurrió un error inesperado procesando tu mensaje.',
    );
    expect(session.isBusy()).toBe(false);
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('boom inesperado'),
    );
  });
});

describe('ChatSession — busy flag', () => {
  it('is busy only while a turn is in flight', async () => {
    classifyScope.mockResolvedValue(true);
    let resolveRunTurn!: (value: unknown) => void;
    runTurn.mockReturnValue(
      new Promise((resolve) => {
        resolveRunTurn = resolve;
      }),
    );
    const session = new ChatSession(fakeAi, fakeMcpManager, config());
    const cb = callbacks();
    expect(session.isBusy()).toBe(false);

    const pending = session.handleUserMessage('hola', cb);
    // Let the classifyScope microtask resolve so runTurn has been called.
    await Promise.resolve();
    await Promise.resolve();
    expect(session.isBusy()).toBe(true);

    resolveRunTurn({ ok: true, newContents: [], finalText: 'ok' });
    await pending;
    expect(session.isBusy()).toBe(false);
  });
});

describe('ChatSession — history truncation (whole turns only)', () => {
  it('agent history: keeps exactly the last N turns once N+1 have been handled (boundary)', async () => {
    classifyScope.mockResolvedValue(true);
    const session = new ChatSession(
      fakeAi,
      fakeMcpManager,
      config({ agentHistoryTurns: 2 }),
    );
    const cb = callbacks();

    for (let i = 1; i <= 3; i++) {
      runTurn.mockResolvedValueOnce({
        ok: true,
        newContents: [{ role: 'user', parts: [{ text: `turno-${i}` }] }],
        finalText: `respuesta-${i}`,
      });
      await session.handleUserMessage(`mensaje-${i}`, cb);
    }

    // One more turn to observe what history is handed to runTurn next.
    runTurn.mockResolvedValueOnce({
      ok: true,
      newContents: [],
      finalText: 'final',
    });
    await session.handleUserMessage('mensaje-4', cb);
    const historySeen = runTurn.mock.calls.at(-1)?.[0].history;
    expect(historySeen).toEqual([
      { role: 'user', parts: [{ text: 'turno-2' }] },
      { role: 'user', parts: [{ text: 'turno-3' }] },
    ]);
  });

  it('classifier history: keeps exactly the last M turns once M+1 have been handled (boundary)', async () => {
    // M=1 with only 3 turns would make slice(-1) and slice(+1) coincide on a
    // 2-element array (both keep just the last element) and let a sign-flip
    // mutant survive; M=2 with 4 turns forces a 3-element array at
    // truncation time, where slice(-2)=[idx1,idx2] and slice(+2)=[idx2]
    // actually diverge.
    const histories: unknown[][] = [];
    classifyScope.mockImplementation(async (_ai, _model, history) => {
      histories.push(structuredClone(history));
      return true;
    });
    const session = new ChatSession(
      fakeAi,
      fakeMcpManager,
      config({ classifierHistoryTurns: 2 }),
    );
    const cb = callbacks();

    for (const letter of ['a', 'b', 'c']) {
      runTurn.mockResolvedValueOnce({
        ok: true,
        newContents: [],
        finalText: `r-${letter}`,
      });
      await session.handleUserMessage(letter, cb);
    }
    runTurn.mockResolvedValueOnce({
      ok: true,
      newContents: [],
      finalText: 'r-d',
    });
    await session.handleUserMessage('d', cb);

    expect(histories.at(-1)).toEqual([
      { userText: 'b', assistantText: 'r-b' },
      { userText: 'c', assistantText: 'r-c' },
    ]);
  });

  it('does not push an empty-newContents turn onto agent history (e.g. the out-of-scope path)', async () => {
    classifyScope.mockResolvedValue(false);
    const session = new ChatSession(
      fakeAi,
      fakeMcpManager,
      config({ agentHistoryTurns: 5 }),
    );
    const cb = callbacks();
    await session.handleUserMessage('fuera de tema', cb);

    classifyScope.mockResolvedValue(true);
    runTurn.mockResolvedValue({ ok: true, newContents: [], finalText: 'r' });
    await session.handleUserMessage('en tema', cb);
    expect(runTurn.mock.calls[0][0].history).toEqual([]);
  });
});
