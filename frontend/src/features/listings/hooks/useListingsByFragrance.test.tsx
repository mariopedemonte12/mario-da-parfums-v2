// @vitest-environment jsdom
// Spec source: specs/fragrance-catalog-cursor-pagination.md (listings hook
// walks `nextCursor` until null; same { listings, loading, error } shape).
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deferred } from "@/test/fetchMock";

import { getListings } from "../api/listings.api";
import type { Listing, PaginatedListings } from "../types/listing.types";
import { useListingsByFragrance } from "./useListingsByFragrance";

vi.mock("../api/listings.api", () => ({ getListings: vi.fn() }));
const mocked = vi.mocked(getListings);

const l = (id: number) => ({ id }) as unknown as Listing;
const page = (ids: number[], next: number | null): PaginatedListings => ({
  data: ids.map(l),
  nextCursor: next,
});

beforeEach(() => {
  mocked.mockReset();
});

describe("useListingsByFragrance", () => {
  it("single page (nextCursor null): one request, limit 100, no cursor", async () => {
    mocked.mockResolvedValue(page([1, 2], null));
    const { result } = renderHook(() => useListingsByFragrance("f1"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings.map((x) => x.id)).toEqual([1, 2]);
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked).toHaveBeenCalledWith({ fragranceId: "f1", limit: 100, cursor: undefined });
  });

  it("walks every page following nextCursor and concatenates in order", async () => {
    mocked
      .mockResolvedValueOnce(page([1, 2], 2))
      .mockResolvedValueOnce(page([3], 3))
      .mockResolvedValueOnce(page([4], null));
    const { result } = renderHook(() => useListingsByFragrance("f1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings.map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(mocked.mock.calls.map((c) => c[0]?.cursor)).toEqual([undefined, 2, 3]);
  });

  it("nextCursor of 0 is a real cursor value, not the end (boundary)", async () => {
    mocked.mockResolvedValueOnce(page([1], 0)).mockResolvedValueOnce(page([2], null));
    const { result } = renderHook(() => useListingsByFragrance("f1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings.map((x) => x.id)).toEqual([1, 2]);
  });

  it("empty page: empty list, no error", async () => {
    mocked.mockResolvedValue(page([], null));
    const { result } = renderHook(() => useListingsByFragrance("f1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listings).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("failure on the first page: error message", async () => {
    mocked.mockRejectedValue(new Error("x"));
    const { result } = renderHook(() => useListingsByFragrance("f1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("No pudimos cargar los precios de este perfume");
    expect(result.current.listings).toEqual([]);
  });

  it("failure mid-pagination: error and no partial table", async () => {
    mocked.mockResolvedValueOnce(page([1], 1)).mockRejectedValueOnce(new Error("x"));
    const { result } = renderHook(() => useListingsByFragrance("f1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
    expect(result.current.listings).toEqual([]);
  });

  it("changing fragrance refetches for the new id; stale response of the old id is ignored", async () => {
    const slow = deferred<PaginatedListings>();
    mocked.mockReturnValueOnce(slow.promise);
    const { result, rerender } = renderHook(({ id }) => useListingsByFragrance(id), {
      initialProps: { id: "old" },
    });
    mocked.mockResolvedValueOnce(page([9], null));
    rerender({ id: "new" });
    await waitFor(() => expect(result.current.listings.map((x) => x.id)).toEqual([9]));
    await act(async () => {
      slow.resolve(page([1], null));
    });
    expect(result.current.listings.map((x) => x.id)).toEqual([9]);
    expect(result.current.loading).toBe(false);
  });

  it("unmount mid-pagination: no throw when the pending page lands", async () => {
    const d = deferred<PaginatedListings>();
    mocked.mockReturnValue(d.promise);
    const { unmount } = renderHook(() => useListingsByFragrance("f1"));
    unmount();
    await act(async () => {
      d.resolve(page([1], null));
    });
  });
});
