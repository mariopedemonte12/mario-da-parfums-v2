// Spec sources: specs/chatbot-server.md ("Protocolo websocket"),
// specs/chatbot-widget.md ("Conexión websocket", "Pérdida de conexión").
//
// Finite-state coverage (0-switch) of WsConnectionState. Events: connect(),
// open, error, close (server side), close() (client side).
//   idle       --connect()-->  connecting
//   connecting --open-->       open
//   connecting --error-->      error
//   connecting --close-->      closed
//   open       --close-->      closed
//   open       --error-->      error
//   error      --close-->      closed
//   error      --connect()-->  connecting (reconnect on demand)
//   closed     --connect()-->  connecting
//   any        --client close()--> idle
// Illegal: connect() while connecting/open is a no-op; send() outside `open`
// throws.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeWebSocket } from "@/test/fakeWebSocket";

import {
  createWsClient,
  type ChatbotServerMessage,
  type WsConnectionState,
} from "./client";

const URL = "ws://test:1234";

beforeEach(() => {
  FakeWebSocket.install();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const client = createWsClient(URL);
  const states: WsConnectionState[] = [];
  const messages: ChatbotServerMessage[] = [];
  client.onStateChange((s) => states.push(s));
  client.onMessage((m) => messages.push(m));
  return { client, states, messages };
}

describe("createWsClient — state machine (0-switch)", () => {
  it("starts idle and does not open a socket until connect()", () => {
    const { client } = setup();
    expect(client.getState()).toBe("idle");
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("idle -> connecting on connect(), using the configured url", () => {
    const { client, states } = setup();
    client.connect();
    expect(client.getState()).toBe("connecting");
    expect(FakeWebSocket.last.url).toBe(URL);
    expect(states).toEqual(["connecting"]);
  });

  it("connecting -> open", () => {
    const { client, states } = setup();
    client.connect();
    FakeWebSocket.last.open();
    expect(client.getState()).toBe("open");
    expect(states).toEqual(["connecting", "open"]);
  });

  it("connecting -> error", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last.fail();
    expect(client.getState()).toBe("error");
  });

  it("connecting -> closed (refused connection closes without open)", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last.serverClose();
    expect(client.getState()).toBe("closed");
  });

  it("open -> closed on server close", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last.open();
    FakeWebSocket.last.serverClose();
    expect(client.getState()).toBe("closed");
  });

  it("open -> error on socket error, then error -> closed on the close that follows", () => {
    const { client, states } = setup();
    client.connect();
    FakeWebSocket.last.open();
    FakeWebSocket.last.fail();
    FakeWebSocket.last.serverClose();
    expect(states).toEqual(["connecting", "open", "error", "closed"]);
  });

  it("closed -> connecting: reconnect opens a NEW socket", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last.open();
    FakeWebSocket.last.serverClose();
    client.connect();
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(client.getState()).toBe("connecting");
    FakeWebSocket.last.open();
    expect(client.getState()).toBe("open");
  });

  it("error -> connecting on connect()", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last.fail();
    client.connect();
    expect(client.getState()).toBe("connecting");
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("connect() while connecting is a no-op (one socket, no extra state event)", () => {
    const { client, states } = setup();
    client.connect();
    client.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(states).toEqual(["connecting"]);
  });

  it("connect() while open is a no-op", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last.open();
    client.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(client.getState()).toBe("open");
  });

  it("close() from open: closes the socket and goes idle", () => {
    const { client } = setup();
    client.connect();
    const socket = FakeWebSocket.last;
    socket.open();
    client.close();
    expect(socket.closeCalls).toBe(1);
    expect(client.getState()).toBe("idle");
  });

  it("close() on a never-connected client is harmless", () => {
    const { client } = setup();
    expect(() => client.close()).not.toThrow();
    expect(client.getState()).toBe("idle");
  });

  it.fails("BUG(low): the `close` event of a socket closed on purpose should not overwrite `idle` with `closed`", () => {
    // After close() the client is `idle`; the browser then fires `close` on the
    // old socket and the client reports `closed`. Both allow reconnect, so it
    // is cosmetic.
    const { client } = setup();
    client.connect();
    FakeWebSocket.last.open();
    client.close();
    FakeWebSocket.last.serverClose();
    expect(client.getState()).toBe("idle");
  });

  // BUG (medium, latent — nothing in the app calls close() today):
  // repro: connect(); open; close(); connect() [socket B, open];
  // then the *old* socket A's `close` event fires. The handler sets
  // `socket = null` and state `closed`, orphaning the healthy socket B:
  // send() throws and connect() opens a third socket. Stale-socket events
  // must be ignored.
  it.fails("BUG: a late close event from a superseded socket must not tear down the new connection", () => {
    const { client } = setup();
    client.connect();
    const a = FakeWebSocket.last;
    a.open();
    client.close();
    client.connect();
    const b = FakeWebSocket.last;
    b.open();
    a.serverClose();
    expect(client.getState()).toBe("open");
    expect(() => client.send({ type: "message", text: "hi" })).not.toThrow();
  });
});

describe("createWsClient — send", () => {
  it("serializes the client message as JSON per protocol", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last.open();
    client.send({ type: "message", text: "algo fresco" });
    expect(FakeWebSocket.last.sent).toEqual([
      JSON.stringify({ type: "message", text: "algo fresco" }),
    ]);
  });

  it.each(["idle", "connecting", "error", "closed"] as const)(
    "throws when state is %s (illegal transition: send outside open)",
    (target) => {
      const { client } = setup();
      if (target !== "idle") client.connect();
      if (target === "error") FakeWebSocket.last.fail();
      if (target === "closed") FakeWebSocket.last.serverClose();
      expect(client.getState()).toBe(target);
      expect(() => client.send({ type: "message", text: "x" })).toThrow();
    }
  );
});

describe("createWsClient — send after an error", () => {
  it("open -> error (close event not yet delivered): send is refused even though the socket object still says OPEN", () => {
    const { client } = setup();
    client.connect();
    FakeWebSocket.last.open();
    FakeWebSocket.last.fail();
    expect(client.getState()).toBe("error");
    expect(() => client.send({ type: "message", text: "x" })).toThrow();
    expect(FakeWebSocket.last.sent).toEqual([]);
  });
});

describe("createWsClient — incoming messages", () => {
  const valid: ChatbotServerMessage[] = [
    { type: "status", text: "Buscando" },
    { type: "token", text: "Ho" },
    {
      type: "fragrances",
      items: [{ id: "1", name: "A", brand: "B", price: null, imageUrl: null }],
    },
    { type: "done" },
    { type: "error", text: "boom" },
  ];

  it.each(valid)("delivers a well-formed %j message", (message) => {
    const { client, messages } = setup();
    client.connect();
    FakeWebSocket.last.open();
    FakeWebSocket.last.receive(message);
    expect(messages).toEqual([message]);
  });

  it("preserves order across many frames", () => {
    const { client, messages } = setup();
    client.connect();
    FakeWebSocket.last.open();
    for (let i = 0; i < 5; i++) FakeWebSocket.last.receive({ type: "token", text: String(i) });
    expect(messages.map((m) => (m as { text: string }).text)).toEqual(["0", "1", "2", "3", "4"]);
  });

  it.each([
    ["not JSON", "hello {"],
    ["empty string", ""],
    ["JSON null", "null"],
    ["JSON number", "42"],
    ["JSON string", '"token"'],
    ["JSON array", "[]"],
    ["object without type", "{}"],
    ["unknown type", '{"type":"nope"}'],
    ["type of wrong kind", '{"type":1}'],
    ["binary frame (Blob-like object)", { size: 3 }],
  ])("ignores malformed frame: %s (no throw, no delivery, connection stays open)", (_n, raw) => {
    const { client, messages } = setup();
    client.connect();
    FakeWebSocket.last.open();
    expect(() => FakeWebSocket.last.receiveRaw(raw)).not.toThrow();
    expect(messages).toEqual([]);
    expect(client.getState()).toBe("open");
  });

  it("keeps working after a malformed frame", () => {
    const { client, messages } = setup();
    client.connect();
    FakeWebSocket.last.open();
    FakeWebSocket.last.receiveRaw("garbage");
    FakeWebSocket.last.receive({ type: "done" });
    expect(messages).toEqual([{ type: "done" }]);
  });

  // BUG (medium): the type guard only checks `type`. A frame like
  // {"type":"fragrances"} (no items) or {"type":"token"} (no text) passes and
  // reaches the consumer: useChatbotSession then does `message.items.map`
  // (TypeError thrown out of the websocket handler, aborting the remaining
  // listeners) or appends "undefined" to the bubble. Repro: server (or a
  // proxy) sends `{"type":"token"}`.
  it.fails("BUG: rejects `token` frames whose text is not a string", () => {
    const { client, messages } = setup();
    client.connect();
    FakeWebSocket.last.open();
    FakeWebSocket.last.receive({ type: "token" });
    expect(messages).toEqual([]);
  });

  it.fails("BUG: rejects `fragrances` frames whose items is not an array", () => {
    const { client, messages } = setup();
    client.connect();
    FakeWebSocket.last.open();
    FakeWebSocket.last.receive({ type: "fragrances" });
    expect(messages).toEqual([]);
  });
});

describe("createWsClient — subscriptions", () => {
  it("unsubscribe stops delivery for that handler only", () => {
    const client = createWsClient(URL);
    const a = vi.fn();
    const b = vi.fn();
    const offA = client.onMessage(a);
    client.onMessage(b);
    client.connect();
    FakeWebSocket.last.open();
    offA();
    FakeWebSocket.last.receive({ type: "done" });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("state unsubscribe stops state notifications", () => {
    const client = createWsClient(URL);
    const a = vi.fn();
    const off = client.onStateChange(a);
    off();
    client.connect();
    expect(a).not.toHaveBeenCalled();
  });

  it("a state listener that unsubscribes itself during notification does not skip the others", () => {
    // The widget's pending-send listener does exactly this.
    const client = createWsClient(URL);
    const later = vi.fn();
    const off = client.onStateChange(() => off());
    client.onStateChange(later);
    client.connect();
    expect(later).toHaveBeenCalledWith("connecting");
  });

  it("two clients are independent", () => {
    const one = createWsClient("ws://one");
    const two = createWsClient("ws://two");
    one.connect();
    expect(two.getState()).toBe("idle");
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
