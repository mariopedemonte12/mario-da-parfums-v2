// @vitest-environment jsdom
// Spec source: specs/fragrance-catalog.md (name/brand inputs are debounced;
// the page uses a 500 ms delay).
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebounce } from "./useDebounce";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("useDebounce", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("a", 500));
    expect(result.current).toBe("a");
  });

  it("delay boundary: unchanged at delay-1, updated at exactly delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 500), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    act(() => vi.advanceTimersByTime(499));
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("b");
  });

  it("rapid changes: only the last value is emitted, after the last change + delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 500), {
      initialProps: { v: "" },
    });
    for (const v of ["r", "ro", "ros", "rose"]) {
      rerender({ v });
      act(() => vi.advanceTimersByTime(300));
    }
    expect(result.current).toBe("");
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("rose");
  });

  it("a value that goes back to the original before the delay still settles on it", () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 500), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    rerender({ v: "a" });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe("a");
  });

  it("changing the delay restarts the timer with the new delay", () => {
    const { result, rerender } = renderHook(({ d }) => useDebounce("x" + d, d), {
      initialProps: { d: 1000 },
    });
    rerender({ d: 100 });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("x100");
  });

  it("clears its timer on unmount (no pending timers, effect cleanup)", () => {
    const { rerender, unmount } = renderHook(({ v }) => useDebounce(v, 500), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("works for non-string values (object identity preserved)", () => {
    const first = { n: 1 };
    const second = { n: 2 };
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 10), {
      initialProps: { v: first },
    });
    rerender({ v: second });
    act(() => vi.advanceTimersByTime(10));
    expect(result.current).toBe(second);
  });
});
