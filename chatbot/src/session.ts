import type { Content, GoogleGenAI } from '@google/genai';
import { runTurn } from './agent/chat-agent.js';
import { withModelFallback } from './gemini/model-fallback.js';
import {
  classifyScope,
  type ClassifierTurn,
} from './guardrail/scope-classifier.js';
import { log } from './logger.js';
import type { McpManager } from './mcp/mcp-manager.js';
import type { ChatbotConfig } from './types.js';
import type { FragranceCard } from './protocol.js';

type AgentTurn = { contents: Content[] };

export type SessionCallbacks = {
  onStatus: (text: string) => void;
  onToken: (text: string) => void;
  onFragrances: (items: FragranceCard[]) => void;
  onDone: () => void;
  onError: (text: string) => void;
};

/**
 * One WS connection = one conversation session (specs/chatbot-server.md,
 * "Qué hace, en términos generales"): in-memory only, no persistence, no
 * user identity, discarded on disconnect.
 *
 * Holds two independent histories (see spec, "Contexto conversacional y
 * sesiones"): the full agent history (complete turns, including
 * function_call/response pairs) and a smaller text-only classifier history —
 * truncated separately, each by whole turns, never mid-turn.
 */
export class ChatSession {
  private agentTurns: AgentTurn[] = [];
  private classifierTurns: ClassifierTurn[] = [];
  private busy = false;
  private readonly classifierAi: GoogleGenAI;
  private readonly agentAi: GoogleGenAI;

  constructor(
    ai: GoogleGenAI,
    private readonly mcpManager: McpManager,
    private readonly config: ChatbotConfig,
  ) {
    this.classifierAi = withModelFallback(
      ai,
      config.classifierModel,
      config.classifierFallbackModel,
    );
    this.agentAi = withModelFallback(
      ai,
      config.agentModel,
      config.agentFallbackModel,
    );
  }

  isBusy(): boolean {
    return this.busy;
  }

  async handleUserMessage(
    text: string,
    callbacks: SessionCallbacks,
  ): Promise<void> {
    this.busy = true;
    try {
      const inScope = await classifyScope(
        this.classifierAi,
        this.config.classifierModel,
        this.classifierTurns,
        text,
      );

      if (!inScope) {
        this.classifierTurns.push({
          userText: text,
          assistantText: this.config.rejectionMessage,
        });
        this.truncateClassifierHistory();
        callbacks.onToken(this.config.rejectionMessage);
        callbacks.onDone();
        return;
      }

      const result = await runTurn({
        ai: this.agentAi,
        model: this.config.agentModel,
        history: this.flattenAgentHistory(),
        userText: text,
        tools: this.mcpManager.getFunctionDeclarations(),
        mcpManager: this.mcpManager,
        maxIterations: this.config.maxToolIterations,
        onStatus: callbacks.onStatus,
        onToken: callbacks.onToken,
        onFragrances: callbacks.onFragrances,
      });

      if (result.newContents.length > 0) {
        this.agentTurns.push({ contents: result.newContents });
        this.truncateAgentHistory();
      }

      if (!result.ok) {
        callbacks.onError(result.error);
        return;
      }

      this.classifierTurns.push({
        userText: text,
        assistantText: result.finalText,
      });
      this.truncateClassifierHistory();
      callbacks.onDone();
    } catch (err) {
      log.error(
        `Error inesperado procesando un turno: ${(err as Error).message}`,
      );
      callbacks.onError('Ocurrió un error inesperado procesando tu mensaje.');
    } finally {
      this.busy = false;
    }
  }

  private flattenAgentHistory(): Content[] {
    return this.agentTurns.flatMap((turn) => turn.contents);
  }

  private truncateAgentHistory(): void {
    if (this.agentTurns.length > this.config.agentHistoryTurns) {
      this.agentTurns = this.agentTurns.slice(-this.config.agentHistoryTurns);
    }
  }

  private truncateClassifierHistory(): void {
    if (this.classifierTurns.length > this.config.classifierHistoryTurns) {
      this.classifierTurns = this.classifierTurns.slice(
        -this.config.classifierHistoryTurns,
      );
    }
  }
}
