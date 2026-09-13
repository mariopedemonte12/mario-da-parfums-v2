import type { GoogleGenAI } from '@google/genai';
import { WebSocketServer, type WebSocket } from 'ws';
import { log } from './logger.js';
import type { McpManager } from './mcp/mcp-manager.js';
import {
  doneMessage,
  errorMessage,
  parseClientMessage,
  statusMessage,
  tokenMessage,
} from './protocol.js';
import { ChatSession } from './session.js';
import type { ChatbotConfig } from './types.js';

function send(socket: WebSocket, frame: string): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(frame);
  }
}

export function startWebSocketServer(
  config: ChatbotConfig,
  ai: GoogleGenAI,
  mcpManager: McpManager,
): WebSocketServer {
  const server = new WebSocketServer({
    host: config.wsHost,
    port: config.wsPort,
  });

  server.on('connection', (socket) => {
    const session = new ChatSession(ai, mcpManager, config);
    log.info('Nueva conexión WS — sesión de conversación iniciada.');

    socket.on('message', (raw) => {
      const parsed = parseClientMessage(raw.toString());
      if (!parsed.ok) {
        send(socket, errorMessage(parsed.reason));
        return;
      }

      const text = parsed.message.text.trim();
      if (text === '') {
        send(socket, errorMessage('El mensaje no puede estar vacío.'));
        return;
      }

      // specs/chatbot-server.md: no se acepta un segundo `message` mientras
      // el turno anterior no terminó (evita interleaving de dos turnos).
      if (session.isBusy()) {
        send(
          socket,
          errorMessage(
            'Ya hay un mensaje en curso, esperá a que termine antes de enviar otro.',
          ),
        );
        return;
      }

      void session.handleUserMessage(text, {
        onStatus: (statusText) => send(socket, statusMessage(statusText)),
        onToken: (tokenText) => send(socket, tokenMessage(tokenText)),
        onDone: () => send(socket, doneMessage()),
        onError: (errorText) => send(socket, errorMessage(errorText)),
      });
    });

    socket.on('close', () => {
      log.info('Conexión WS cerrada — sesión descartada.');
    });

    socket.on('error', (err) => {
      log.warn(`Error de socket: ${err.message}`);
    });
  });

  return server;
}
