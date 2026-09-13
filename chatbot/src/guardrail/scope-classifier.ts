import type { GoogleGenAI } from '@google/genai';
import { log } from '../logger.js';
import { SCOPE_JUDGE_SYSTEM_PROMPT } from './prompts.js';

export type ClassifierTurn = {
  userText: string;
  /** The bot's reply, in-scope answer or the fixed rejection copy — either way, it's what the classifier saw. */
  assistantText: string;
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    in_scope: { type: 'boolean' },
  },
  required: ['in_scope'],
  additionalProperties: false,
};

/**
 * Stage 1 of the guardrail: a lightweight Gemini call judging whether
 * `newMessage` is in scope, given the last few turns of *text-only* history
 * for continuity (per specs/chatbot-server.md, "Guardrail — etapa 1").
 *
 * Fail-open by design: any failure (network, rate limit, malformed output)
 * is treated as in-scope — a broken classifier must not take the whole bot
 * down, and stage 2's system prompt is the safety net.
 */
export async function classifyScope(
  ai: GoogleGenAI,
  model: string,
  history: ClassifierTurn[],
  newMessage: string,
): Promise<boolean> {
  try {
    const contents = [
      ...history.flatMap((turn) => [
        { role: 'user', parts: [{ text: turn.userText }] },
        { role: 'model', parts: [{ text: turn.assistantText }] },
      ]),
      { role: 'user', parts: [{ text: newMessage }] },
    ];

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: SCOPE_JUDGE_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
      },
    });

    const parsed = JSON.parse(response.text ?? '{}') as { in_scope?: unknown };
    return parsed.in_scope === true;
  } catch (err) {
    log.warn(
      `Clasificador de scope falló, fail-open (in_scope=true): ${(err as Error).message}`,
    );
    return true;
  }
}
