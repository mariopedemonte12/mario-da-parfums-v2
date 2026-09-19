// @vitest-environment jsdom
// Spec source: specs/home-search.md ("States", "Edge cases", content mapping).
//
// 0-switch over the states  idle -> loading -> success | empty | error:
//   idle --search(blank)--> idle (no request)      idle --search--> loading
//   loading --results resolved--> success          loading --none resolved / no results--> empty
//   loading --any HTTP rejects--> error
//   success|empty|error --reset--> idle            error --search(same query)--> loading (retry)
//   success|empty|error --search--> loading
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { findFragranceByExactName } from "@/features/fragrances/api/fragrances.api";
import type { Fragrance } from "@/features/fragrances/types/fragrance.types";
import { deferred } from "@/test/fetchMock";

import { searchFragrancesByDescription } from "../api/search.api";
import type { SemanticSearchResponse } from "../types/search.types";
import { useFragranceSearch } from "./useFragranceSearch";

vi.mock("../api/search.api", () => ({ searchFragrancesByDescription: vi.fn() }));
vi.mock("@/features/fragrances/api/fragrances.api", () => ({ findFragranceByExactName: vi.fn() }));

const semantic = vi.mocked(searchFragrancesByDescription);
const resolve = vi.mocked(findFragranceByExactName);

const frag = (name: string) => ({ id: `id-${name}`, name }) as unknown as Fragrance;
const results = (...pairs: [string, number][]) =>
  ({ results: pairs.map(([name, score]) => ({ name, score })) }) as unknown as SemanticSearchResponse;

beforeEach(() => {
  semantic.mockReset();
  resolve.mockReset();
  resolve.mockImplementation(async (name) => frag(name));
});

describe("useFragranceSearch", () => {
  it("starts idle with empty query and matches", () => {
    const { result } = renderHook(() => useFragranceSearch());
    expect(result.current).toMatchObject({ status: "idle", query: "", matches: [] });
  });

  it.each(["", "   ", "\t\n"])("blank query %j: no request, stays idle", async (q) => {
    const { result } = renderHook(() => useFragranceSearch());
    await act(async () => result.current.search(q));
    expect(semantic).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("goes to loading immediately (before any network resolves) and stores the trimmed query", async () => {
    const d = deferred<SemanticSearchResponse>();
    semantic.mockReturnValue(d.promise);
    const { result } = renderHook(() => useFragranceSearch());
    let p!: Promise<void>;
    act(() => {
      p = result.current.search("  una tarde de lluvia  ");
    });
    expect(result.current.status).toBe("loading");
    expect(result.current.query).toBe("una tarde de lluvia");
    expect(semantic).toHaveBeenCalledWith("una tarde de lluvia", 4);
    await act(async () => {
      d.resolve(results());
      await p;
    });
  });

  it("success: keeps /search order, maps score to integer percentage", async () => {
    semantic.mockResolvedValue(results(["A", 0.876], ["B", 0.5], ["C", 0.004], ["D", 1]));
    const { result } = renderHook(() => useFragranceSearch());
    await act(async () => result.current.search("x"));
    expect(result.current.status).toBe("success");
    expect(result.current.matches.map((m) => [m.fragrance.name, m.affinity])).toEqual([
      ["A", 88],
      ["B", 50],
      ["C", 0],
      ["D", 100],
    ]);
  });

  it("rounds the affinity at the .5 boundary (0.005 -> 1, 0.0049 -> 0)", async () => {
    semantic.mockResolvedValue(results(["A", 0.005], ["B", 0.0049]));
    const { result } = renderHook(() => useFragranceSearch());
    await act(async () => result.current.search("x"));
    expect(result.current.matches.map((m) => m.affinity)).toEqual([1, 0]);
  });

  it("drops an unresolvable name without failing, and does not hold its slot", async () => {
    semantic.mockResolvedValue(results(["Gone", 0.9], ["B", 0.8], ["C", 0.7]));
    resolve.mockImplementation(async (name) => (name === "Gone" ? null : frag(name)));
    const { result } = renderHook(() => useFragranceSearch());
    await act(async () => result.current.search("x"));
    expect(result.current.status).toBe("success");
    expect(result.current.matches.map((m) => m.fragrance.name)).toEqual(["B", "C"]);
  });

  it("a single resolved result is a valid success (protagonist without secondaries)", async () => {
    semantic.mockResolvedValue(results(["Only", 0.9]));
    const { result } = renderHook(() => useFragranceSearch());
    await act(async () => result.current.search("x"));
    expect(result.current.status).toBe("success");
    expect(result.current.matches).toHaveLength(1);
  });

  it("empty when /search returns no results", async () => {
    semantic.mockResolvedValue(results());
    const { result } = renderHook(() => useFragranceSearch());
    await act(async () => result.current.search("x"));
    expect(result.current.status).toBe("empty");
    expect(result.current.matches).toEqual([]);
  });

  it("empty when none of the names resolve (same state as no results)", async () => {
    semantic.mockResolvedValue(results(["A", 0.9], ["B", 0.8]));
    resolve.mockResolvedValue(null);
    const { result } = renderHook(() => useFragranceSearch());
    await act(async () => result.current.search("x"));
    expect(result.current.status).toBe("empty");
  });

  it.each([
    ["semantic service 503", () => semantic.mockRejectedValue(new Error("503"))],
    [
      "catalog lookup rejects",
      () => {
        semantic.mockResolvedValue(results(["A", 0.9]));
        resolve.mockRejectedValue(new Error("net"));
      },
    ],
  ])("error when %s; matches cleared", async (_n, arrange) => {
    arrange();
    const { result } = renderHook(() => useFragranceSearch());
    await act(async () => result.current.search("x"));
    expect(result.current.status).toBe("error");
    expect(result.current.matches).toEqual([]);
  });

  it("error clears previous successful matches", async () => {
    semantic.mockResolvedValueOnce(results(["A", 0.9]));
    const { result } = renderHook(() => useFragranceSearch());
    await act(async () => result.current.search("one"));
    semantic.mockRejectedValueOnce(new Error("x"));
    await act(async () => result.current.search("two"));
    expect(result.current.matches).toEqual([]);
  });

  it("retry with the same query goes through loading again and can succeed", async () => {
    semantic.mockRejectedValueOnce(new Error("503"));
    const { result } = renderHook(() => useFragranceSearch());
    await act(async () => result.current.search("x"));
    expect(result.current.status).toBe("error");
    semantic.mockResolvedValueOnce(results(["A", 0.9]));
    await act(async () => result.current.search(result.current.query));
    expect(result.current.status).toBe("success");
  });

  it.each([
    ["success", () => semantic.mockResolvedValue(results(["A", 0.9]))],
    ["empty", () => semantic.mockResolvedValue(results())],
    ["error", () => semantic.mockRejectedValue(new Error("x"))],
  ])("reset from %s returns to a fresh idle (no carried-over query/matches)", async (_n, arrange) => {
    arrange();
    const { result } = renderHook(() => useFragranceSearch());
    await act(async () => result.current.search("x"));
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ status: "idle", query: "", matches: [] });
  });

  // BUG (medium): searches are not sequenced. Repro: search("lento") whose
  // /search is slow, then search("rapido") which resolves first; when the old
  // request finally resolves it overwrites matches/status with the results of
  // the OLD query while `query` shows the NEW one (results panel shows the
  // wrong perfumes under the new quote).
  it.fails("BUG: a slow older search must not overwrite the newer one", async () => {
    const slow = deferred<SemanticSearchResponse>();
    semantic.mockReturnValueOnce(slow.promise);
    semantic.mockResolvedValueOnce(results(["Fast", 0.9]));
    const { result } = renderHook(() => useFragranceSearch());
    let first!: Promise<void>;
    act(() => {
      first = result.current.search("lento");
    });
    await act(async () => result.current.search("rapido"));
    await act(async () => {
      slow.resolve(results(["Slow", 0.9]));
      await first;
    });
    expect(result.current.query).toBe("rapido");
    expect(result.current.matches.map((m) => m.fragrance.name)).toEqual(["Fast"]);
  });

  // BUG (medium): "← Otra búsqueda" (reset) while a search is in flight: spec
  // says it "resets straight back to idle ... from any of the four states",
  // but the in-flight search resolves afterwards and pushes the hook back to
  // success/empty/error, re-opening the results panel the user just closed.
  it.fails("BUG: a search resolving after reset() does not leave idle", async () => {
    const d = deferred<SemanticSearchResponse>();
    semantic.mockReturnValue(d.promise);
    const { result } = renderHook(() => useFragranceSearch());
    let p!: Promise<void>;
    act(() => {
      p = result.current.search("x");
    });
    act(() => result.current.reset());
    await act(async () => {
      d.resolve(results(["A", 0.9]));
      await p;
    });
    expect(result.current.status).toBe("idle");
  });
});
