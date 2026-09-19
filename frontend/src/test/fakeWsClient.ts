// Controllable stand-in for `WsClient` (lib/ws/client.ts), used to test hooks
// that consume `chatbotWs` without a socket underneath.
import type {
  ChatbotClientMessage,
  ChatbotServerMessage,
  WsClient,
  WsConnectionState,
} from "@/lib/ws/client";

export class FakeWsClient implements WsClient {
  state: WsConnectionState = "idle";
  sent: ChatbotClientMessage[] = [];
  connectCalls = 0;
  private messageListeners = new Set<(m: ChatbotServerMessage) => void>();
  private stateListeners = new Set<(s: WsConnectionState) => void>();

  get messageListenerCount() {
    return this.messageListeners.size;
  }
  get stateListenerCount() {
    return this.stateListeners.size;
  }

  reset() {
    this.state = "idle";
    this.sent = [];
    this.connectCalls = 0;
    this.messageListeners.clear();
    this.stateListeners.clear();
  }

  connect() {
    this.connectCalls += 1;
    if (this.state === "open" || this.state === "connecting") return;
    this.setState("connecting");
  }

  close() {
    this.setState("idle");
  }

  send(message: ChatbotClientMessage) {
    if (this.state !== "open") throw new Error("Cannot send: not open");
    this.sent.push(message);
  }

  onMessage(handler: (m: ChatbotServerMessage) => void) {
    this.messageListeners.add(handler);
    return () => {
      this.messageListeners.delete(handler);
    };
  }

  onStateChange(handler: (s: WsConnectionState) => void) {
    this.stateListeners.add(handler);
    return () => {
      this.stateListeners.delete(handler);
    };
  }

  getState() {
    return this.state;
  }

  // --- test drivers ---
  setState(next: WsConnectionState) {
    this.state = next;
    [...this.stateListeners].forEach((l) => l(next));
  }

  emit(message: ChatbotServerMessage) {
    [...this.messageListeners].forEach((l) => l(message));
  }
}
