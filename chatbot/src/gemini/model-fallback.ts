import type { GoogleGenAI } from '@google/genai';
import { log } from '../logger.js';

type ModelCallParams = { model: string } & Record<string, unknown>;
type ModelMethod = 'generateContent' | 'generateContentStream';

/**
 * Wraps a GoogleGenAI client so that any `generateContent`/
 * `generateContentStream` call made with `primaryModel` transparently
 * retries once with `fallbackModel` if the primary call throws — e.g. a
 * model id that's been retired (404 "no longer available to new users").
 *
 * Only intercepts the initial call: a failure that happens mid-stream,
 * after `generateContentStream` already resolved and partial chunks were
 * consumed, is NOT retried here (retrying would re-run the whole turn and
 * duplicate already-streamed output) — callers (chat-agent.ts) already
 * treat that as a turn error and discard the partial text, per
 * specs/chatbot-widget.md.
 *
 * Callers keep passing `primaryModel` as `model`, exactly as before — the
 * fallback is invisible to chat-agent.ts / scope-classifier.ts and their
 * existing tests.
 */
export function withModelFallback(
  ai: GoogleGenAI,
  primaryModel: string,
  fallbackModel: string,
): GoogleGenAI {
  function wrap(methodName: ModelMethod) {
    // Resolved lazily, per call — not at wrap() time — so a fake client in
    // tests that only stubs the method it expects to be exercised (e.g. only
    // `generateContent`, no `generateContentStream`) isn't forced to stub both.
    function call(params: ModelCallParams) {
      const method = ai.models[methodName].bind(ai.models) as unknown as (
        params: ModelCallParams,
      ) => Promise<unknown>;
      return method(params);
    }

    return async (params: ModelCallParams) => {
      if (params.model !== primaryModel) {
        return call(params);
      }
      try {
        return await call(params);
      } catch (err) {
        log.warn(
          `Modelo "${primaryModel}" falló, reintentando con fallback "${fallbackModel}": ${(err as Error).message}`,
        );
        return call({ ...params, model: fallbackModel });
      }
    };
  }

  return {
    models: {
      generateContent: wrap('generateContent'),
      generateContentStream: wrap('generateContentStream'),
    },
  } as unknown as GoogleGenAI;
}
