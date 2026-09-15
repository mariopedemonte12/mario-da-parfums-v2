import {
  createPartFromFunctionResponse,
  type Content,
  type FunctionDeclaration,
  type GoogleGenAI,
  type Part,
} from '@google/genai';
import { log } from '../logger.js';
import type { McpManager } from '../mcp/mcp-manager.js';
import type { FragranceCard } from '../protocol.js';
import {
  PRESENT_FRAGRANCES_TOOL,
  PRESENT_FRAGRANCES_TOOL_NAME,
  presentFragrancesArgsSchema,
} from './present-fragrances-tool.js';
import { AGENT_SYSTEM_PROMPT } from './system-prompt.js';

export type RunTurnParams = {
  ai: GoogleGenAI;
  model: string;
  /** Flattened history from prior turns (already truncated to the configured window), oldest first. */
  history: Content[];
  userText: string;
  /** MCP tool declarations only — the local present_fragrances tool is added internally. */
  tools: FunctionDeclaration[];
  mcpManager: McpManager;
  maxIterations: number;
  onStatus: (text: string) => void;
  onToken: (text: string) => void;
  onFragrances: (items: FragranceCard[]) => void;
};

export type RunTurnResult =
  | { ok: true; newContents: Content[]; finalText: string }
  | { ok: false; newContents: Content[]; error: string };

/**
 * Runs one full turn of the tool-calling loop (specs/chatbot-server.md,
 * "Flujo agéntico principal"): call Gemini, execute any function_call it
 * returns via the aggregated MCP tool catalog, feed the results back, repeat
 * until Gemini answers with plain text or `maxIterations` is hit.
 *
 * `newContents` is returned incrementally-safe: it only ever contains
 * complete function_call/function_response pairs (plus the trailing final
 * answer on success), so the caller can always append it to session history
 * even if this turn ultimately errors out partway through.
 */
export async function runTurn(params: RunTurnParams): Promise<RunTurnResult> {
  const {
    ai,
    model,
    history,
    userText,
    tools,
    mcpManager,
    maxIterations,
    onStatus,
    onToken,
    onFragrances,
  } = params;

  const allTools = [...tools, PRESENT_FRAGRANCES_TOOL];

  const newContents: Content[] = [
    { role: 'user', parts: [{ text: userText }] },
  ];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const iterationStart = Date.now();
    let stream;
    try {
      stream = await ai.models.generateContentStream({
        model,
        contents: [...history, ...newContents],
        config: {
          systemInstruction: AGENT_SYSTEM_PROMPT,
          tools: [{ functionDeclarations: allTools }],
        },
      });
    } catch (err) {
      return {
        ok: false,
        newContents,
        error: `Falló la llamada a Gemini: ${(err as Error).message}`,
      };
    }

    let finalText = '';
    const functionCalls: {
      id?: string;
      name: string;
      args: Record<string, unknown>;
    }[] = [];
    let responseParts: Part[] = [];

    try {
      for await (const chunk of stream) {
        const candidateParts = chunk.candidates?.[0]?.content?.parts ?? [];
        if (candidateParts.length > 0) {
          responseParts = [...responseParts, ...candidateParts];
        }
        if (chunk.text) {
          finalText += chunk.text;
          // Streamed live per specs/chatbot-server.md's own rationale for
          // choosing WS over a plain request/response endpoint. See
          // src/NOTES.md for why we don't buffer-and-suppress this when the
          // same response also carries a function_call.
          onToken(chunk.text);
        }
        for (const call of chunk.functionCalls ?? []) {
          if (call.name) {
            functionCalls.push({
              id: call.id,
              name: call.name,
              args: call.args ?? {},
            });
          }
        }
      }
    } catch (err) {
      return {
        ok: false,
        newContents,
        error: `Falló la llamada a Gemini: ${(err as Error).message}`,
      };
    }

    log.info(
      `[iter ${iteration}] Gemini respondió en ${Date.now() - iterationStart}ms — ${
        functionCalls.length > 0
          ? functionCalls.map((c) => `${c.name}(${JSON.stringify(c.args)})`).join(', ')
          : 'texto final'
      }`,
    );

    if (functionCalls.length === 0) {
      newContents.push({
        role: 'model',
        parts: responseParts.length > 0 ? responseParts : [{ text: finalText }],
      });
      return { ok: true, newContents, finalText };
    }

    newContents.push({ role: 'model', parts: responseParts });

    const functionResponseParts: Part[] = [];
    for (const call of functionCalls) {
      if (call.name === PRESENT_FRAGRANCES_TOOL_NAME) {
        const parsed = presentFragrancesArgsSchema.safeParse(call.args);
        const responsePayload = parsed.success
          ? { output: { presented: parsed.data.items.length } }
          : { error: 'Argumentos inválidos para present_fragrances.' };
        if (parsed.success) {
          onFragrances(parsed.data.items);
        }
        functionResponseParts.push(
          createPartFromFunctionResponse(
            call.id ?? call.name,
            call.name,
            responsePayload,
          ),
        );
        continue;
      }

      onStatus(`Usando ${call.name}...`);
      const outcome = await mcpManager.callTool(call.name, call.args);
      const responsePayload = outcome.isError
        ? { error: outcome.payload }
        : { output: outcome.payload };
      functionResponseParts.push(
        createPartFromFunctionResponse(
          call.id ?? call.name,
          call.name,
          responsePayload,
        ),
      );
    }
    newContents.push({ role: 'user', parts: functionResponseParts });
  }

  log.warn('Se superó el límite de iteraciones del ciclo de tool calling.');
  return {
    ok: false,
    newContents,
    error:
      'Se superó el límite de pasos resolviendo tu pregunta. Probá reformularla.',
  };
}
