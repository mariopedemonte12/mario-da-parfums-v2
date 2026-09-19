// @vitest-environment jsdom
// Spec sources: specs/chatbot-widget.md ("Un turno a la vez", "Indicador de
// pensando", "Tarjetas de perfume", "Manejo de error de turno", "Pérdida de
// conexión inesperada"), specs/chatbot-server.md ("Protocolo websocket").
//
// Every scenario runs twice: plain and under <React.StrictMode> (which
// double-invokes setState updaters and effects) to catch impure updaters.
//
// Turn state machine (0-switch):
//   idle --send--> waiting(thinking) --status--> waiting(status)
//   waiting --token--> streaming --token--> streaming
//   waiting|streaming --done--> idle
//   waiting|streaming --error--> idle (+error entry)
//   waiting|streaming --ws closed/error--> idle (+error entry)
//   idle --send(empty)--> idle (no-op) ; waiting --send--> waiting (ignored)
import { StrictMode, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chatbotWs } from "@/lib/ws/clients";
import type { FakeWsClient } from "@/test/fakeWsClient";

import { useChatbotSession } from "./useChatbotSession";

vi.mock("@/lib/ws/clients", async () => {
  const { FakeWsClient } = await import("@/test/fakeWsClient");
  return { chatbotWs: new FakeWsClient() };
});

const ws = chatbotWs as unknown as FakeWsClient;

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
const plain = ({ children }: { children: ReactNode }) => <>{children}</>;

beforeEach(() => {
  ws.reset();
});

describe.each([
  ["plain", plain],
  ["StrictMode", strict],
])("useChatbotSession (%s)", (_label, wrapper) => {
  function setup() {
    return renderHook(() => useChatbotSession(), { wrapper });
  }
  function openAndSend(text = "hola") {
    const hook = setup();
    ws.state = "open";
    act(() => hook.result.current.sendMessage(text));
    return hook;
  }
  const texts = (hook: ReturnType<typeof setup>) =>
    hook.result.current.messages.map((m) => `${m.role}:${m.text}`);

  describe("initial state and connection", () => {
    it("starts empty, idle and does not connect on mount (lazy connection)", () => {
      const hook = setup();
      expect(hook.result.current.messages).toEqual([]);
      expect(hook.result.current.turnInProgress).toBe(false);
      expect(hook.result.current.isThinking).toBe(false);
      expect(hook.result.current.statusText).toBeNull();
      expect(ws.connectCalls).toBe(0);
    });

    it("ensureConnected connects only from idle/closed/error", () => {
      const hook = setup();
      act(() => hook.result.current.ensureConnected());
      expect(ws.connectCalls).toBe(1);
      // connecting now: no second connect
      act(() => hook.result.current.ensureConnected());
      expect(ws.connectCalls).toBe(1);
      act(() => ws.setState("open"));
      act(() => hook.result.current.ensureConnected());
      expect(ws.connectCalls).toBe(1);
      act(() => ws.setState("closed"));
      act(() => hook.result.current.ensureConnected());
      expect(ws.connectCalls).toBe(2);
      act(() => ws.setState("error"));
      act(() => hook.result.current.ensureConnected());
      expect(ws.connectCalls).toBe(3);
    });

    it.each(["connecting", "open", "closed", "error"] as const)(
      "mirrors connection state %s",
      (state) => {
        const hook = setup();
        act(() => ws.setState(state));
        expect(hook.result.current.connectionState).toBe(state);
      }
    );

    it("reads the client's current state on first render", () => {
      ws.state = "open";
      const hook = setup();
      expect(hook.result.current.connectionState).toBe("open");
    });
  });

  describe("sending", () => {
    it.each(["", "   ", "\n\t "])("ignores empty/whitespace-only input %j", (raw) => {
      const hook = openAndSend(raw);
      expect(hook.result.current.messages).toEqual([]);
      expect(ws.sent).toEqual([]);
      expect(hook.result.current.turnInProgress).toBe(false);
    });

    it("sends trimmed text over an open socket and records the user message", () => {
      const hook = openAndSend("  hola sensei  ");
      expect(ws.sent).toEqual([{ type: "message", text: "hola sensei" }]);
      expect(texts(hook)).toEqual(["user:hola sensei"]);
      expect(hook.result.current.turnInProgress).toBe(true);
      expect(hook.result.current.isThinking).toBe(true);
    });

    it("a second send during a turn is ignored (one turn at a time)", () => {
      const hook = openAndSend("uno");
      act(() => hook.result.current.sendMessage("dos"));
      expect(ws.sent).toHaveLength(1);
      expect(texts(hook)).toEqual(["user:uno"]);
    });

    it("when not open, connects and sends exactly once when the socket opens", () => {
      const hook = setup();
      act(() => hook.result.current.sendMessage("hola"));
      expect(ws.connectCalls).toBe(1);
      expect(ws.sent).toEqual([]);
      expect(hook.result.current.turnInProgress).toBe(true);
      act(() => ws.setState("open"));
      expect(ws.sent).toEqual([{ type: "message", text: "hola" }]);
      // later state flaps must not resend
      act(() => ws.setState("open"));
      expect(ws.sent).toHaveLength(1);
    });

    it("connection failure before opening: one error entry, input re-enabled", () => {
      const hook = setup();
      act(() => hook.result.current.sendMessage("hola"));
      act(() => ws.setState("error"));
      expect(hook.result.current.turnInProgress).toBe(false);
      expect(hook.result.current.isThinking).toBe(false);
      const errors = hook.result.current.messages.filter((m) => m.role === "error");
      // exactly one entry: see the regression test below
      expect(errors).toHaveLength(1);
    });

    // Regression (fixed) (low/medium): while the socket is connecting, TWO listeners react to
    // the same failure (the effect listener -> "Se perdió la conexión..." and
    // the pending-send listener -> "No se pudo conectar..."), so the history
    // gets two error bubbles for one failed turn. Spec: "agrega una entrada de
    // error" (singular). Repro: closed socket, sendMessage("hola"), then the
    // socket errors before opening.
    it("a failed connection produces exactly one error entry", () => {
      const hook = setup();
      act(() => hook.result.current.sendMessage("hola"));
      act(() => ws.setState("error"));
      expect(hook.result.current.messages.filter((m) => m.role === "error")).toHaveLength(1);
    });

    it("after a failed connection the user can retry and it reconnects", () => {
      const hook = setup();
      act(() => hook.result.current.sendMessage("hola"));
      act(() => ws.setState("closed"));
      const before = ws.connectCalls;
      act(() => hook.result.current.sendMessage("otra vez"));
      expect(ws.connectCalls).toBe(before + 1);
      act(() => ws.setState("open"));
      expect(ws.sent.at(-1)).toEqual({ type: "message", text: "otra vez" });
    });

    it("send while ensureConnected is still connecting sends once on open", () => {
      const hook = setup();
      act(() => hook.result.current.ensureConnected());
      act(() => hook.result.current.sendMessage("hola"));
      act(() => ws.setState("open"));
      expect(ws.sent).toEqual([{ type: "message", text: "hola" }]);
    });
  });

  describe("streaming (token deltas)", () => {
    it("status shows text; first token clears status/thinking and starts one assistant bubble", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "status", text: "Buscando en el catálogo…" }));
      expect(hook.result.current.statusText).toBe("Buscando en el catálogo…");
      expect(hook.result.current.isThinking).toBe(true);
      act(() => ws.emit({ type: "token", text: "Hola" }));
      expect(hook.result.current.statusText).toBeNull();
      expect(hook.result.current.isThinking).toBe(false);
      expect(hook.result.current.turnInProgress).toBe(true);
      expect(texts(hook)).toEqual(["user:hola", "assistant:Hola"]);
    });

    it("concatenates deltas in order into ONE bubble, nothing lost or duplicated", () => {
      const hook = openAndSend();
      const deltas = ["El ", "cedro ", "es ", "cálido", "."];
      for (const d of deltas) act(() => ws.emit({ type: "token", text: d }));
      expect(texts(hook)).toEqual(["user:hola", "assistant:El cedro es cálido."]);
    });

    it("message ids are unique", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "token", text: "a" }));
      act(() => ws.emit({ type: "fragrances", items: [] }));
      const ids = hook.result.current.messages.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("done ends the turn and re-enables input; next turn starts a NEW bubble", () => {
      const hook = openAndSend("uno");
      act(() => ws.emit({ type: "token", text: "r1" }));
      act(() => ws.emit({ type: "done" }));
      expect(hook.result.current.turnInProgress).toBe(false);
      expect(hook.result.current.isThinking).toBe(false);
      act(() => hook.result.current.sendMessage("dos"));
      act(() => ws.emit({ type: "token", text: "r2" }));
      expect(texts(hook)).toEqual(["user:uno", "assistant:r1", "user:dos", "assistant:r2"]);
    });

    it("done without any token just ends the turn", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "done" }));
      expect(texts(hook)).toEqual(["user:hola"]);
      expect(hook.result.current.turnInProgress).toBe(false);
    });

    it("status after done does not resurrect the thinking indicator", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "done" }));
      expect(hook.result.current.isThinking).toBe(false);
    });
  });

  describe("fragrance cards", () => {
    const item = (id: string, price: number | null = 100) => ({
      id,
      name: `N${id}`,
      brand: "B",
      price,
      imageUrl: null,
    });

    it("adds a card entry (empty text) linking to /fragrances/<id>, keeping price null as null", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "fragrances", items: [item("a", null), item("b", 50)] }));
      const card = hook.result.current.messages.at(-1)!;
      expect(card.role).toBe("assistant");
      expect(card.text).toBe("");
      expect(card.fragrances).toEqual([
        { id: "a", name: "Na", brand: "B", price: null, imageUrl: null, href: "/fragrances/a" },
        { id: "b", name: "Nb", brand: "B", price: 50, imageUrl: null, href: "/fragrances/b" },
      ]);
    });

    it("cards before tokens: text goes into a separate later bubble", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "fragrances", items: [item("a")] }));
      act(() => ws.emit({ type: "token", text: "Mira" }));
      act(() => ws.emit({ type: "token", text: " esto" }));
      const list = hook.result.current.messages;
      expect(list.map((m) => m.role)).toEqual(["user", "assistant", "assistant"]);
      expect(list[1].fragrances).toHaveLength(1);
      expect(list[2].text).toBe("Mira esto");
    });

    it("multiple card events in a turn are all kept, in arrival order, without dedup", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "fragrances", items: [item("a")] }));
      act(() => ws.emit({ type: "fragrances", items: [item("a")] }));
      expect(hook.result.current.messages.filter((m) => m.fragrances)).toHaveLength(2);
    });

    it("zero-item card event does not throw", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "fragrances", items: [] }));
      expect(hook.result.current.messages.at(-1)?.fragrances).toEqual([]);
    });

    // Regression (fixed) (low): spec says cards are added "en el orden en que llega" and can be
    // interleaved with tokens. Sequence token, fragrances, token appends the
    // second token to the FIRST bubble (streamingIdRef is still set), so the
    // text ends up before the cards instead of after them.
    it("text arriving after a card entry lands after it, not in the earlier bubble", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "token", text: "antes " }));
      act(() => ws.emit({ type: "fragrances", items: [item("a")] }));
      act(() => ws.emit({ type: "token", text: "despues" }));
      const list = hook.result.current.messages;
      expect(list.at(-1)?.text).toBe("despues");
    });
  });

  describe("turn errors (server error frame)", () => {
    it("keeps the cards but discards all partial text bubbles of the turn on error", () => {
      const hook = openAndSend();
      const card = { id: "a", name: "A", brand: "B", price: 1, imageUrl: null };
      act(() => ws.emit({ type: "token", text: "antes " }));
      act(() => ws.emit({ type: "fragrances", items: [card] }));
      act(() => ws.emit({ type: "token", text: "despues" }));
      act(() => ws.emit({ type: "error", text: "fallo" }));
      const list = hook.result.current.messages;
      expect(list.filter((m) => m.role === "assistant" && !m.fragrances)).toEqual([]);
      expect(list.some((m) => m.fragrances)).toBe(true);
      expect(list.at(-1)).toMatchObject({ role: "error", text: "fallo" });
    });

    it("shows the server text as an error entry and re-enables input", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "error", text: "rate limit" }));
      expect(hook.result.current.messages.at(-1)).toMatchObject({ role: "error", text: "rate limit" });
      expect(hook.result.current.turnInProgress).toBe(false);
      expect(hook.result.current.isThinking).toBe(false);
      expect(hook.result.current.statusText).toBeNull();
    });

    it("user can retry right away after an error (connection stays open)", () => {
      const hook = openAndSend("uno");
      act(() => ws.emit({ type: "error", text: "x" }));
      act(() => hook.result.current.sendMessage("dos"));
      expect(ws.sent.map((m) => m.text)).toEqual(["uno", "dos"]);
    });

    it("tokens of the next turn start a fresh bubble after an error", () => {
      const hook = openAndSend("uno");
      act(() => ws.emit({ type: "token", text: "parcial" }));
      act(() => ws.emit({ type: "error", text: "x" }));
      act(() => hook.result.current.sendMessage("dos"));
      act(() => ws.emit({ type: "token", text: "nuevo" }));
      const assistant = hook.result.current.messages.filter((m) => m.role === "assistant");
      expect(assistant.at(-1)?.text).toBe("nuevo");
    });

    // Regression (fixed) (medium): spec ("Manejo de error de turno"): "Cualquier texto parcial
    // que se hubiera empezado a streamear como token antes del error del mismo
    // turno se descarta — solo se conserva la entrada de error." The hook
    // keeps the half-written assistant bubble. Repro: token "Hola mund", then
    // {"type":"error"}.
    it("partial streamed text is discarded when the turn errors", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "token", text: "Hola mund" }));
      act(() => ws.emit({ type: "error", text: "fallo" }));
      expect(hook.result.current.messages.filter((m) => m.role === "assistant")).toEqual([]);
    });
  });

  describe("unexpected connection loss", () => {
    it.each(["closed", "error"] as const)(
      "%s mid-turn: generic error entry, input re-enabled, indicators cleared",
      (state) => {
        const hook = openAndSend();
        act(() => ws.emit({ type: "status", text: "Buscando" }));
        act(() => ws.setState(state));
        expect(hook.result.current.turnInProgress).toBe(false);
        expect(hook.result.current.isThinking).toBe(false);
        expect(hook.result.current.statusText).toBeNull();
        const errors = hook.result.current.messages.filter((m) => m.role === "error");
        expect(errors).toHaveLength(1);
        expect(errors[0].text).toMatch(/conexi/i);
      }
    );

    it.each(["closed", "error"] as const)(
      "%s when NO turn is in progress adds no error entry",
      (state) => {
        const hook = setup();
        act(() => ws.setState(state));
        expect(hook.result.current.messages).toEqual([]);
      }
    );

    it("closed after done adds no error entry", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "done" }));
      act(() => ws.setState("closed"));
      expect(hook.result.current.messages.filter((m) => m.role === "error")).toEqual([]);
    });

    it("history is kept across reconnection; the next send reconnects and works", () => {
      const hook = openAndSend("uno");
      act(() => ws.emit({ type: "token", text: "r" }));
      act(() => ws.emit({ type: "done" }));
      act(() => ws.setState("closed"));
      act(() => hook.result.current.sendMessage("dos"));
      expect(ws.connectCalls).toBeGreaterThan(0);
      act(() => ws.setState("open"));
      expect(ws.sent.at(-1)).toEqual({ type: "message", text: "dos" });
      expect(hook.result.current.messages.map((m) => m.text)).toContain("r");
    });

    // Regression (fixed) (medium): same spec section, "descarta cualquier streaming parcial".
    it("partial streamed text is discarded when the socket drops mid-stream", () => {
      const hook = openAndSend();
      act(() => ws.emit({ type: "token", text: "Hola mund" }));
      act(() => ws.setState("closed"));
      expect(hook.result.current.messages.filter((m) => m.role === "assistant")).toEqual([]);
    });

    it("stale tokens from a dropped turn do not merge into the next turn's bubble", () => {
      const hook = openAndSend("uno");
      act(() => ws.emit({ type: "token", text: "viejo" }));
      act(() => ws.setState("closed"));
      act(() => hook.result.current.sendMessage("dos"));
      act(() => ws.setState("open"));
      act(() => ws.emit({ type: "token", text: "nuevo" }));
      const assistant = hook.result.current.messages.filter((m) => m.role === "assistant");
      expect(assistant.map((m) => m.text)).toContain("nuevo");
      expect(assistant.some((m) => m.text.includes("viejonuevo"))).toBe(false);
    });
  });

  describe("unmount", () => {
    it("removes its websocket listeners", () => {
      const hook = setup();
      hook.unmount();
      expect(ws.messageListenerCount).toBe(0);
      expect(ws.stateListenerCount).toBe(0);
    });

    it("events after unmount do not throw", () => {
      const hook = openAndSend();
      hook.unmount();
      expect(() => {
        ws.emit({ type: "token", text: "late" });
        ws.setState("closed");
      }).not.toThrow();
    });

    // Regression (fixed) (medium, leak): sendMessage on a non-open socket registers a
    // one-shot state listener that is only removed when the socket opens or
    // fails. If the provider unmounts while connecting, the listener stays
    // registered on the module-level singleton and later calls
    // chatbotWs.send() for a session that no longer exists.
    // Repro: closed socket, sendMessage("hola"), unmount, socket opens.
    it("a pending send listener is removed on unmount", () => {
      const hook = setup();
      act(() => hook.result.current.sendMessage("hola"));
      hook.unmount();
      expect(ws.stateListenerCount).toBe(0);
    });
  });
});
