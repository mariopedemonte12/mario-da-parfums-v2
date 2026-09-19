// Test double for the browser WebSocket: the test drives every event by hand
// (`open()`, `receive()`, `serverClose()`, `fail()`), nothing is asynchronous.
import { vi } from "vitest";

type Listener = (event: { data?: unknown }) => void;

export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closeCalls = 0;
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  static get last(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }

  static install() {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string) {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error("InvalidStateError: socket is not open");
    }
    this.sent.push(data);
  }

  // Like the real one: only starts closing; the `close` event arrives later,
  // when the test calls `serverClose()`.
  close() {
    this.closeCalls += 1;
    this.readyState = FakeWebSocket.CLOSING;
  }

  private emit(type: string, event: { data?: unknown } = {}) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  receive(data: unknown) {
    this.emit("message", { data: typeof data === "string" ? data : JSON.stringify(data) });
  }

  receiveRaw(data: unknown) {
    this.emit("message", { data });
  }

  fail() {
    this.emit("error");
  }

  serverClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }
}
