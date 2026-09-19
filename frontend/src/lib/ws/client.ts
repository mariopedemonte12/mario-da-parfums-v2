// Chatbot websocket protocol — see specs/chatbot-server.md.
export type ChatbotClientMessage = { type: "message"; text: string };

export type ChatbotFragranceCard = {
  id: string;
  name: string;
  brand: string;
  price: number | null;
  imageUrl: string | null;
};

export type ChatbotServerMessage =
  | { type: "status"; text: string }
  | { type: "token"; text: string }
  | { type: "fragrances"; items: ChatbotFragranceCard[] }
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

function isFragranceCard(value: unknown): value is ChatbotFragranceCard {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const card = value as Record<string, unknown>;
  return (
    typeof card.id === "string" &&
    typeof card.name === "string" &&
    typeof card.brand === "string" &&
    (card.price === null || typeof card.price === "number") &&
    (card.imageUrl === null || typeof card.imageUrl === "string")
  );
}

// Validates the shape of every frame type, not just `type`: a malformed frame
// is dropped here so consumers never see it.
function isChatbotServerMessage(value: unknown): value is ChatbotServerMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  const frame = value as Record<string, unknown>;
  switch (frame.type) {
    case "done":
      return true;
    case "status":
    case "token":
    case "error":
      return typeof frame.text === "string";
    case "fragrances":
      return Array.isArray(frame.items) && frame.items.every(isFragranceCard);
    default:
      return false;
  }
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
    const ws = new WebSocket(url);
    socket = ws;

    // Events from a socket that is no longer the current one (closed on
    // purpose, then reconnected) must not touch the client state.
    ws.addEventListener("open", () => {
      if (socket !== ws) return;
      setState("open");
    });

    ws.addEventListener("message", (event) => {
      if (socket !== ws) return;
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

    ws.addEventListener("close", () => {
      if (socket !== ws) return;
      socket = null;
      setState("closed");
    });

    ws.addEventListener("error", () => {
      if (socket !== ws) return;
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
