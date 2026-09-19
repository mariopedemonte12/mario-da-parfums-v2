// @vitest-environment jsdom
// Spec sources: specs/fragrance-catalog-cursor-pagination.md ("Cargar más",
// filter change resets to a fresh first page, race safety), specs/fragrance-catalog.md.
//
// Decision table (event x state) covered:
//   first page ok / error ; loadMore ok / error / no cursor / already loading ;
//   filter change (idle) / filter change while first page in flight /
//   filter change while loadMore in flight.
import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deferred } from "@/test/fetchMock";

import { getFragrances } from "../api/fragrances.api";
import type { Fragrance, PaginatedFragranceResponse } from "../types/fragrance.types";
import { useFragrances } from "./useFragrance";

vi.mock("../api/fragrances.api", () => ({ getFragrances: vi.fn() }));
const mocked = vi.mocked(getFragrances);

const f = (id: string) => ({ id, name: `N${id}` }) as unknown as Fragrance;
const pageOf = (ids: string[], nextCursor: string | null): PaginatedFragranceResponse => ({
  data: ids.map(f),
  nextCursor,
});
const ids = (list: Fragrance[]) => list.map((x) => x.id);

beforeEach(() => {
  mocked.mockReset();
});

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
const plain = ({ children }: { children: ReactNode }) => <>{children}</>;

describe.each([
  ["plain", plain],
  ["StrictMode", strict],
])("useFragrances (%s)", (_l, wrapper) => {
  type Params = Parameters<typeof useFragrances>[0];
  const setup = (initial: Params = { limit: 2 }) =>
    renderHook((p: Params) => useFragrances(p), { wrapper, initialProps: initial });

  describe("first page", () => {
    it("starts loading with empty list; then shows data and hasMore from nextCursor", async () => {
      mocked.mockResolvedValue(pageOf(["1", "2"], "c2"));
      const { result } = setup();
      expect(result.current.loading).toBe(true);
      expect(result.current.fragrances).toEqual([]);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(ids(result.current.fragrances)).toEqual(["1", "2"]);
      expect(result.current.hasMore).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it("nextCursor null: hasMore false (boundary: last page)", async () => {
      mocked.mockResolvedValue(pageOf(["1"], null));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.hasMore).toBe(false);
    });

    it("empty result: empty list, no more, no error", async () => {
      mocked.mockResolvedValue(pageOf([], null));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.fragrances).toEqual([]);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("failure: error message, loading false", async () => {
      mocked.mockRejectedValue(new Error("x"));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBe("No se pudieron cargar los perfumes");
    });

    it("passes filters and limit to the API and never a cursor for page one", async () => {
      mocked.mockResolvedValue(pageOf([], null));
      setup({ search: "rose", concentration: "EDP", targetAudience: "women", longevity: "long", limit: 7 });
      await waitFor(() => expect(mocked).toHaveBeenCalled());
      expect(mocked).toHaveBeenLastCalledWith({
        search: "rose",
        concentration: "EDP",
        targetAudience: "women",
        longevity: "long",
        limit: 7,
      });
    });
  });

  describe("loadMore", () => {
    it("appends the next page (keeping existing items in order) and passes the cursor", async () => {
      mocked.mockResolvedValueOnce(pageOf(["1", "2"], "c2"));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      mocked.mockResolvedValueOnce(pageOf(["3"], null));
      await act(async () => {
        await result.current.loadMore();
      });
      expect(ids(result.current.fragrances)).toEqual(["1", "2", "3"]);
      expect(result.current.hasMore).toBe(false);
      expect(mocked).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "c2" }));
      expect(result.current.loadingMore).toBe(false);
      // full-page loading must not come back for load-more
      expect(result.current.loading).toBe(false);
    });

    it("shows loadingMore while in flight and keeps existing results visible", async () => {
      mocked.mockResolvedValueOnce(pageOf(["1"], "c"));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      const d = deferred<PaginatedFragranceResponse>();
      mocked.mockReturnValueOnce(d.promise);
      let p!: Promise<void>;
      act(() => {
        p = result.current.loadMore();
      });
      expect(result.current.loadingMore).toBe(true);
      expect(result.current.loading).toBe(false);
      expect(ids(result.current.fragrances)).toEqual(["1"]);
      await act(async () => {
        d.resolve(pageOf(["2"], null));
        await p;
      });
      expect(result.current.loadingMore).toBe(false);
    });

    it("is a no-op when there is no next cursor", async () => {
      mocked.mockResolvedValueOnce(pageOf(["1"], null));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      const before = mocked.mock.calls.length;
      await act(async () => {
        await result.current.loadMore();
      });
      expect(mocked.mock.calls.length).toBe(before);
    });

    it("is a no-op while a loadMore is already in flight (rendered state)", async () => {
      mocked.mockResolvedValueOnce(pageOf(["1"], "c"));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      const d = deferred<PaginatedFragranceResponse>();
      mocked.mockReturnValueOnce(d.promise);
      act(() => {
        void result.current.loadMore();
      });
      const calls = mocked.mock.calls.length;
      act(() => {
        void result.current.loadMore();
      });
      expect(mocked.mock.calls.length).toBe(calls);
      await act(async () => {
        d.resolve(pageOf([], null));
      });
    });

    it("failure keeps the loaded items, sets the load-more error, clears loadingMore", async () => {
      mocked.mockResolvedValueOnce(pageOf(["1"], "c"));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      mocked.mockRejectedValueOnce(new Error("x"));
      await act(async () => {
        await result.current.loadMore();
      });
      expect(ids(result.current.fragrances)).toEqual(["1"]);
      expect(result.current.error).toBe("No se pudieron cargar más perfumes");
      expect(result.current.loadingMore).toBe(false);
      expect(result.current.hasMore).toBe(true);
    });
  });

  describe("filter changes and out-of-order responses", () => {
    it("a filter change replaces (not appends) the list with the new first page", async () => {
      mocked.mockResolvedValueOnce(pageOf(["1", "2"], "c"));
      const { result, rerender } = setup({ search: "a", limit: 2 });
      await waitFor(() => expect(result.current.loading).toBe(false));
      mocked.mockResolvedValueOnce(pageOf(["9"], null));
      rerender({ search: "b", limit: 2 });
      await waitFor(() => expect(ids(result.current.fragrances)).toEqual(["9"]));
      expect(result.current.hasMore).toBe(false);
    });

    it("first-page responses out of order: the slow old filter must not win", async () => {
      const slow = deferred<PaginatedFragranceResponse>();
      mocked.mockReturnValueOnce(slow.promise);
      const { result, rerender } = setup({ search: "old", limit: 2 });
      mocked.mockResolvedValueOnce(pageOf(["new"], null));
      rerender({ search: "new", limit: 2 });
      await waitFor(() => expect(ids(result.current.fragrances)).toEqual(["new"]));
      await act(async () => {
        slow.resolve(pageOf(["old"], "cOld"));
      });
      expect(ids(result.current.fragrances)).toEqual(["new"]);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.loading).toBe(false);
    });

    it("a stale failure must not set an error over the new filter's result", async () => {
      const slow = deferred<PaginatedFragranceResponse>();
      mocked.mockReturnValueOnce(slow.promise);
      const { result, rerender } = setup({ search: "old", limit: 2 });
      mocked.mockResolvedValueOnce(pageOf(["new"], null));
      rerender({ search: "new", limit: 2 });
      await waitFor(() => expect(ids(result.current.fragrances)).toEqual(["new"]));
      await act(async () => {
        slow.reject(new Error("late"));
      });
      expect(result.current.error).toBeNull();
    });

    it("stale loadMore response is not appended after a filter change (race safety)", async () => {
      mocked.mockResolvedValueOnce(pageOf(["1"], "c"));
      const { result, rerender } = setup({ search: "a", limit: 2 });
      await waitFor(() => expect(result.current.loading).toBe(false));
      const staleMore = deferred<PaginatedFragranceResponse>();
      mocked.mockReturnValueOnce(staleMore.promise);
      act(() => {
        void result.current.loadMore();
      });
      mocked.mockResolvedValueOnce(pageOf(["9"], null));
      rerender({ search: "b", limit: 2 });
      await waitFor(() => expect(ids(result.current.fragrances)).toEqual(["9"]));
      await act(async () => {
        staleMore.resolve(pageOf(["STALE"], "zzz"));
      });
      expect(ids(result.current.fragrances)).toEqual(["9"]);
      expect(result.current.hasMore).toBe(false);
    });

    it("loadingMore returns to false after a filter change interrupts a load-more", async () => {
      mocked.mockResolvedValueOnce(pageOf(["1"], "c"));
      const { result, rerender } = setup({ search: "a", limit: 2 });
      await waitFor(() => expect(result.current.loading).toBe(false));
      const staleMore = deferred<PaginatedFragranceResponse>();
      mocked.mockReturnValueOnce(staleMore.promise);
      act(() => {
        void result.current.loadMore();
      });
      mocked.mockResolvedValueOnce(pageOf(["9"], "c9"));
      rerender({ search: "b", limit: 2 });
      await waitFor(() => expect(ids(result.current.fragrances)).toEqual(["9"]));
      await act(async () => {
        staleMore.resolve(pageOf(["STALE"], null));
      });
      expect(result.current.loadingMore).toBe(false);
    });

    it("a double loadMore in the same tick fetches once", async () => {
      mocked.mockResolvedValueOnce(pageOf(["1"], "c"));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      mocked.mockResolvedValue(pageOf(["2"], null));
      const before = mocked.mock.calls.length;
      await act(async () => {
        void result.current.loadMore();
        void result.current.loadMore();
      });
      expect(mocked.mock.calls.length - before).toBe(1);
      expect(ids(result.current.fragrances)).toEqual(["1", "2"]);
    });
  });
});
