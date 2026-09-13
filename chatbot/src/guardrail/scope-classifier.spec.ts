import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';

vi.mock('../logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { classifyScope } = await import('./scope-classifier.js');
const { log } = await import('../logger.js');

function fakeAi(generateContent: (...args: unknown[]) => unknown): GoogleGenAI {
  return { models: { generateContent } } as unknown as GoogleGenAI;
}

beforeEach(() => {
  vi.mocked(log.warn).mockClear();
});

describe('classifyScope', () => {
  it('returns true when the judge responds { in_scope: true }', async () => {
    const ai = fakeAi(async () => ({ text: '{"in_scope": true}' }));
    await expect(classifyScope(ai, 'model', [], 'hola')).resolves.toBe(true);
  });

  it('returns false when the judge responds { in_scope: false }', async () => {
    const ai = fakeAi(async () => ({ text: '{"in_scope": false}' }));
    await expect(
      classifyScope(ai, 'model', [], 'clima de mañana'),
    ).resolves.toBe(false);
  });

  it('fails open (true) when the Gemini call throws', async () => {
    const ai = fakeAi(async () => {
      throw new Error('rate limited');
    });
    await expect(classifyScope(ai, 'model', [], 'hola')).resolves.toBe(true);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('fail-open'));
  });

  it('fails open (true) when the response text is not valid JSON', async () => {
    const ai = fakeAi(async () => ({ text: 'not json' }));
    await expect(classifyScope(ai, 'model', [], 'hola')).resolves.toBe(true);
  });

  // Boundary: a successful call with no parseable in_scope field is NOT a
  // thrown failure, so it does not take the fail-open path — JSON.parse('{}')
  // succeeds and `in_scope` is undefined, so the strict `=== true` check
  // below resolves to false. Documents actual current behavior; see the
  // testing session's report for whether this is the intended interpretation
  // of "fail-open" when the judge model answers but omits the field.
  it('treats a well-formed but empty response object as out-of-scope (not fail-open)', async () => {
    const ai = fakeAi(async () => ({ text: '{}' }));
    await expect(classifyScope(ai, 'model', [], 'hola')).resolves.toBe(false);
  });

  it('treats a non-boolean in_scope value as out-of-scope (strict === true check)', async () => {
    const ai = fakeAi(async () => ({ text: '{"in_scope": "true"}' }));
    await expect(classifyScope(ai, 'model', [], 'hola')).resolves.toBe(false);
  });

  it('treats a missing response.text as out-of-scope (JSON.parse falls back to "{}")', async () => {
    const ai = fakeAi(async () => ({}));
    await expect(classifyScope(ai, 'model', [], 'hola')).resolves.toBe(false);
  });

  it('sends history turns as alternating user/model contents followed by the new message', async () => {
    const generateContent = vi.fn(async (_args: unknown) => ({
      text: '{"in_scope": true}',
    }));
    const ai = fakeAi(generateContent);
    await classifyScope(
      ai,
      'model',
      [{ userText: 'hola', assistantText: 'hola, en qué te ayudo?' }],
      '¿y el segundo más barato?',
    );
    const call = generateContent.mock.calls[0][0] as { contents: unknown[] };
    expect(call.contents).toEqual([
      { role: 'user', parts: [{ text: 'hola' }] },
      { role: 'model', parts: [{ text: 'hola, en qué te ayudo?' }] },
      { role: 'user', parts: [{ text: '¿y el segundo más barato?' }] },
    ]);
  });

  it('sends only the new message when history is empty (boundary: 0 turns)', async () => {
    const generateContent = vi.fn(async (_args: unknown) => ({
      text: '{"in_scope": true}',
    }));
    const ai = fakeAi(generateContent);
    await classifyScope(ai, 'model', [], 'hola');
    const call = generateContent.mock.calls[0][0] as { contents: unknown[] };
    expect(call.contents).toEqual([
      { role: 'user', parts: [{ text: 'hola' }] },
    ]);
  });

  // The forced-JSON-schema config is what makes the judge's output
  // machine-parseable at all (no free text to disambiguate, per the spec) —
  // a loosened schema (e.g. additionalProperties left true, or `in_scope`
  // not required) would silently reopen exactly the ambiguity the schema
  // exists to remove, so it's asserted here as an API-contract shape, not an
  // incidental implementation detail.
  it('forces structured JSON output with the exact in_scope boolean schema', async () => {
    const generateContent = vi.fn(async (_args: unknown) => ({
      text: '{"in_scope": true}',
    }));
    const ai = fakeAi(generateContent);
    await classifyScope(ai, 'model', [], 'hola');
    const call = generateContent.mock.calls[0][0] as {
      config: {
        responseMimeType: string;
        responseJsonSchema: unknown;
        systemInstruction: string;
      };
    };
    expect(call.config.responseMimeType).toBe('application/json');
    expect(call.config.responseJsonSchema).toEqual({
      type: 'object',
      properties: { in_scope: { type: 'boolean' } },
      required: ['in_scope'],
      additionalProperties: false,
    });
    expect(call.config.systemInstruction).toEqual(expect.any(String));
  });
});
