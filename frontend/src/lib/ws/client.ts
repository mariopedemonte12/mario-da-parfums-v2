// Chatbot websocket protocol — see specs/chatbot-server.md.
export type ChatbotClientMessage = { type: "message"; text: string };

export type ChatbotServerMessage =
  | { type: "status"; text: string }
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; text: string };

export type WsConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

export interface WsClient {
  connect(): void;
  close(): void;
  send(message: ChatbotClientMessage): void;
  onMessage(handler: (message: ChatbotServerMessage) => void): () => void;
  onStateChange(handler: (state: WsConnectionState) => void): () => void;
  getState(): WsConnectionState;
}

function isChatbotServerMessage(value: unknown): value is ChatbotServerMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  const type = (value as { type: unknown }).type;
  return (
    type === "status" || type === "token" || type === "done" || type === "error"
  );
}

export function createWsClient(url: string): WsClient {
  let socket: WebSocket | null = null;
  let state: WsConnectionState = "idle";

  const messageListeners = new Set<(message: ChatbotServerMessage) => void>();
  const stateListeners = new Set<(state: WsConnectionState) => void>();

  function setState(next: WsConnectionState) {
    state = next;
    stateListeners.forEach((listener) => listener(state));
  }

  function connect() {
    if (socket && (state === "open" || state === "connecting")) {
      return;
    }

    setState("connecting");
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      setState("open");
    });

    socket.addEventListener("message", (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }

      if (isChatbotServerMessage(parsed)) {
        messageListeners.forEach((listener) => listener(parsed));
      }
    });

    socket.addEventListener("close", () => {
      socket = null;
      setState("closed");
    });

    socket.addEventListener("error", () => {
      setState("error");
    });
  }

  function close() {
    socket?.close();
    socket = null;
    setState("idle");
  }

  function send(message: ChatbotClientMessage) {
    if (!socket || state !== "open") {
      throw new Error("Cannot send: chatbot websocket is not open");
    }

    socket.send(JSON.stringify(message));
  }

  function onMessage(handler: (message: ChatbotServerMessage) => void) {
    messageListeners.add(handler);
    return () => messageListeners.delete(handler);
  }

  function onStateChange(handler: (state: WsConnectionState) => void) {
    stateListeners.add(handler);
    return () => stateListeners.delete(handler);
  }

  return {
    connect,
    close,
    send,
    onMessage,
    onStateChange,
    getState: () => state,
  };
}
