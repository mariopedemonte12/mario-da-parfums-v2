// @vitest-environment jsdom
// Spec source: specs/fragrance-detail.md (not-found is a distinct state from a
// network error; a 404/400 makes the API return null).
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deferred } from "@/test/fetchMock";

import { getFragranceById } from "../api/fragrances.api";
import type { FragranceDetail } from "../types/fragrance.types";
import { useFragranceDetail } from "./useFragranceDetail";

vi.mock("../api/fragrances.api", () => ({ getFragranceById: vi.fn() }));
const mocked = vi.mocked(getFragranceById);
const detail = (id: string) => ({ id, name: `N${id}` }) as unknown as FragranceDetail;

beforeEach(() => {
  mocked.mockReset();
});

describe("useFragranceDetail", () => {
  it("starts loading, then exposes the fragrance", async () => {
    mocked.mockResolvedValue(detail("a"));
    const { result } = renderHook(() => useFragranceDetail("a"));
    expect(result.current).toEqual({ fragrance: null, loading: true, error: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.fragrance).toEqual(detail("a"));
    expect(result.current.error).toBeNull();
    expect(mocked).toHaveBeenCalledWith("a");
  });

  it("not found (API returns null): fragrance null and NO error (distinct from network error)", async () => {
    mocked.mockResolvedValue(null);
    const { result } = renderHook(() => useFragranceDetail("a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.fragrance).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("network error: error message, fragrance null", async () => {
    mocked.mockRejectedValue(new Error("net"));
    const { result } = renderHook(() => useFragranceDetail("a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("No pudimos cargar este perfume");
    expect(result.current.fragrance).toBeNull();
  });

  it("id change refetches and clears the previous error", async () => {
    mocked.mockRejectedValueOnce(new Error("net"));
    const { result, rerender } = renderHook(({ id }) => useFragranceDetail(id), {
      initialProps: { id: "a" },
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    mocked.mockResolvedValueOnce(detail("b"));
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.fragrance).toEqual(detail("b")));
    expect(result.current.error).toBeNull();
  });

  it("out of order: a slow response for the previous id must not overwrite the current one", async () => {
    const slow = deferred<FragranceDetail | null>();
    mocked.mockReturnValueOnce(slow.promise);
    const { result, rerender } = renderHook(({ id }) => useFragranceDetail(id), {
      initialProps: { id: "a" },
    });
    mocked.mockResolvedValueOnce(detail("b"));
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.fragrance).toEqual(detail("b")));
    await act(async () => {
      slow.resolve(detail("a"));
    });
    expect(result.current.fragrance).toEqual(detail("b"));
    expect(result.current.loading).toBe(false);
  });

  it("a stale rejection does not set an error for the current id", async () => {
    const slow = deferred<FragranceDetail | null>();
    mocked.mockReturnValueOnce(slow.promise);
    const { result, rerender } = renderHook(({ id }) => useFragranceDetail(id), {
      initialProps: { id: "a" },
    });
    mocked.mockResolvedValueOnce(detail("b"));
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.fragrance).toEqual(detail("b")));
    await act(async () => {
      slow.reject(new Error("late"));
    });
    expect(result.current.error).toBeNull();
  });

  it("unmount before resolution: late response is ignored without throwing", async () => {
    const d = deferred<FragranceDetail | null>();
    mocked.mockReturnValue(d.promise);
    const { unmount } = renderHook(() => useFragranceDetail("a"));
    unmount();
    await act(async () => {
      d.resolve(detail("a"));
    });
  });

  it("after navigating to an id whose request fails, the previous fragrance is not kept", async () => {
    mocked.mockResolvedValueOnce(detail("a"));
    const { result, rerender } = renderHook(({ id }) => useFragranceDetail(id), {
      initialProps: { id: "a" },
    });
    await waitFor(() => expect(result.current.fragrance).toEqual(detail("a")));
    mocked.mockRejectedValueOnce(new Error("net"));
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
    expect(result.current.fragrance).toBeNull();
  });
});
