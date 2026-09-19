// @vitest-environment jsdom
// Spec source: specs/fragrance-detail.md (vendor names for the price table)
// and specs/vendors-crud.md (page/limit pagination with meta.totalPages).
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deferred } from "@/test/fetchMock";

import { getVendors } from "../api/vendors.api";
import type { PaginatedVendors, Vendor } from "../types/vendor.types";
import { useVendors } from "./useVendors";

vi.mock("../api/vendors.api", () => ({ getVendors: vi.fn() }));
const mocked = vi.mocked(getVendors);

const v = (id: number) => ({ id, name: `V${id}` }) as unknown as Vendor;
const page = (ids: number[], totalPages: number) =>
  ({ data: ids.map(v), meta: { totalPages } }) as unknown as PaginatedVendors;

beforeEach(() => {
  mocked.mockReset();
});

describe("useVendors", () => {
  it.each([0, 1])("totalPages=%i (boundary): only page 1 is requested", async (totalPages) => {
    mocked.mockResolvedValue(page([1], totalPages));
    const { result } = renderHook(() => useVendors());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked).toHaveBeenCalledWith(1, 100);
    expect(result.current.vendors.map((x) => x.id)).toEqual([1]);
  });

  it("totalPages=3: fetches pages 2 and 3 and concatenates in order", async () => {
    mocked
      .mockResolvedValueOnce(page([1], 3))
      .mockResolvedValueOnce(page([2], 3))
      .mockResolvedValueOnce(page([3], 3));
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocked.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(result.current.vendors.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it("failure on first page: error message", async () => {
    mocked.mockRejectedValue(new Error("x"));
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("No pudimos cargar las tiendas");
    expect(result.current.vendors).toEqual([]);
  });

  it("failure on a later page: error, no partial list", async () => {
    mocked.mockResolvedValueOnce(page([1], 2)).mockRejectedValueOnce(new Error("x"));
    const { result } = renderHook(() => useVendors());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
    expect(result.current.vendors).toEqual([]);
  });

  it("unmount before resolution: no throw when responses land", async () => {
    const d = deferred<PaginatedVendors>();
    mocked.mockReturnValue(d.promise);
    const { unmount } = renderHook(() => useVendors());
    unmount();
    await act(async () => {
      d.resolve(page([1], 1));
    });
  });
});
