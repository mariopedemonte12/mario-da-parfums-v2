// @vitest-environment jsdom
// Integration: useChatbotSession on top of the REAL ws client (lib/ws/client.ts)
// with a FakeWebSocket underneath, under StrictMode. Covers the seam between
// both units: frames -> hook state, reconnection creating a new socket.
import { StrictMode, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeWebSocket } from "@/test/fakeWebSocket";

import { useChatbotSession } from "./useChatbotSession";

vi.mock("@/lib/ws/clients", async () => {
  const { createWsClient } = await import("@/lib/ws/client");
  return { chatbotWs: createWsClient("ws://fake") };
});

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

beforeEach(() => {
  FakeWebSocket.install();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// The chatbotWs singleton is shared by the file, so the scenarios are one
// ordered story rather than independent tests.
describe("chatbot session over the real ws client", () => {
  it("lazy connect, streamed turn, cards, malformed frame, drop and on-demand reconnect", () => {
    const { result } = renderHook(() => useChatbotSession(), { wrapper });
    expect(FakeWebSocket.instances).toHaveLength(0); // lazy: nothing on mount

    // send while disconnected: connects, then sends once opened
    act(() => result.current.sendMessage("algo fresco"));
    expect(FakeWebSocket.instances).toHaveLength(1);
    const first = FakeWebSocket.last;
    act(() => first.open());
    expect(first.sent).toEqual([JSON.stringify({ type: "message", text: "algo fresco" })]);

    // streaming with a malformed frame in the middle
    act(() => first.receive({ type: "status", text: "Buscando" }));
    act(() => first.receive({ type: "token", text: "Te " }));
    act(() => first.receiveRaw("<<garbage>>"));
    act(() => first.receive({ type: "token", text: "recomiendo" }));
    act(() =>
      first.receive({
        type: "fragrances",
        items: [{ id: "u1", name: "N", brand: "B", price: null, imageUrl: null }],
      })
    );
    act(() => first.receive({ type: "done" }));
    const list = result.current.messages;
    expect(list.map((m) => m.role)).toEqual(["user", "assistant", "assistant"]);
    expect(list[1].text).toBe("Te recomiendo");
    expect(list[2].fragrances?.[0].href).toBe("/fragrances/u1");
    expect(result.current.turnInProgress).toBe(false);

    // second turn dies with the connection
    act(() => result.current.sendMessage("otra"));
    act(() => first.receive({ type: "token", text: "par" }));
    act(() => first.serverClose());
    expect(result.current.turnInProgress).toBe(false);
    expect(result.current.messages.at(-1)?.role).toBe("error");
    expect(result.current.connectionState).toBe("closed");

    // next send reconnects with a NEW socket; history is kept
    act(() => result.current.sendMessage("de nuevo"));
    expect(FakeWebSocket.instances).toHaveLength(2);
    const second = FakeWebSocket.last;
    act(() => second.open());
    expect(second.sent).toEqual([JSON.stringify({ type: "message", text: "de nuevo" })]);
    expect(result.current.messages[1].text).toBe("Te recomiendo");
  });
});
