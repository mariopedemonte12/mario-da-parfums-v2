// @vitest-environment jsdom
// Spec source: specs/favorite-hearts.md ("Behavior": optimistic toggle, revert
// on failure, one app-wide set fed once per session, nothing fetched when
// logged out, disabled while a toggle is in flight).
//
// Decision table (session x toggle outcome):
//   logged out            -> empty set, no fetch
//   logged in, list ok    -> set filled, loaded
//   logged in, list fails -> set stays empty, loaded=false
//   toggle add ok / add fails(revert) / remove ok / remove fails(revert)
import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/features/auth/types/user.types";
import { deferred } from "@/test/fetchMock";

import { addFavorite, listFavoriteIds, removeFavorite } from "../api/favorites.api";
import { FavoritesProvider, useFavorites } from "./useFavorites";

const auth = vi.hoisted(() => ({ value: { user: null as unknown, isHydrating: false } }));
vi.mock("@/features/auth/hooks/useAuth", () => ({ useAuth: () => auth.value }));
vi.mock("../api/favorites.api", () => ({
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  listFavoriteIds: vi.fn(),
}));

const list = vi.mocked(listFavoriteIds);
const add = vi.mocked(addFavorite);
const remove = vi.mocked(removeFavorite);

const user = { id: 1 } as User;
function setAuth(u: User | null, isHydrating = false) {
  auth.value = { user: u, isHydrating };
}

beforeEach(() => {
  list.mockReset();
  add.mockReset();
  remove.mockReset();
  setAuth(user);
});

const strictWrap = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <FavoritesProvider>{children}</FavoritesProvider>
  </StrictMode>
);
const plainWrap = ({ children }: { children: ReactNode }) => (
  <FavoritesProvider>{children}</FavoritesProvider>
);

describe.each([
  ["plain", plainWrap],
  ["StrictMode", strictWrap],
])("useFavorites (%s)", (_l, wrapper) => {
  const setup = () => renderHook(() => useFavorites(), { wrapper });

  describe("loading the set", () => {
    it("logged in: fetches once the ids and marks them favorite", async () => {
      list.mockResolvedValue(["a", "b"]);
      const { result } = setup();
      expect(result.current.loaded).toBe(false);
      await waitFor(() => expect(result.current.loaded).toBe(true));
      expect(result.current.isFavorite("a")).toBe(true);
      expect(result.current.isFavorite("b")).toBe(true);
      expect(result.current.isFavorite("c")).toBe(false);
    });

    it("logged out: no request, empty set", () => {
      setAuth(null);
      const { result } = setup();
      expect(list).not.toHaveBeenCalled();
      expect(result.current.loaded).toBe(false);
      expect(result.current.isFavorite("a")).toBe(false);
    });

    it("waits for hydration before deciding (no fetch while isHydrating)", () => {
      setAuth(user, true);
      setup();
      expect(list).not.toHaveBeenCalled();
    });

    it("fetch failure is silent: nothing favorite, loaded stays false", async () => {
      list.mockRejectedValue(new Error("x"));
      const { result } = setup();
      await act(async () => {});
      expect(result.current.loaded).toBe(false);
      expect(result.current.isFavorite("a")).toBe(false);
    });

    it("logout clears the set", async () => {
      list.mockResolvedValue(["a"]);
      const { result, rerender } = setup();
      await waitFor(() => expect(result.current.isFavorite("a")).toBe(true));
      setAuth(null);
      rerender();
      expect(result.current.isFavorite("a")).toBe(false);
      expect(result.current.loaded).toBe(false);
    });

    it("a list response that lands after logout is discarded", async () => {
      const d = deferred<string[]>();
      list.mockReturnValue(d.promise);
      const { result, rerender } = setup();
      setAuth(null);
      rerender();
      await act(async () => {
        d.resolve(["leak"]);
      });
      expect(result.current.isFavorite("leak")).toBe(false);
    });

    it("switching to another user re-fetches and does not merge the previous user's set", async () => {
      list.mockResolvedValueOnce(["a"]);
      const { result, rerender } = setup();
      await waitFor(() => expect(result.current.isFavorite("a")).toBe(true));
      list.mockResolvedValueOnce(["z"]);
      setAuth({ id: 2 } as User);
      rerender();
      await waitFor(() => expect(result.current.isFavorite("z")).toBe(true));
      expect(result.current.isFavorite("a")).toBe(false);
    });
  });

  describe("toggle", () => {
    async function ready(ids: string[] = []) {
      list.mockResolvedValue(ids);
      const hook = setup();
      await waitFor(() => expect(hook.result.current.loaded).toBe(true));
      return hook;
    }

    it("add is optimistic: flips before the request resolves, pending while in flight, then settles", async () => {
      const { result } = await ready();
      const d = deferred<void>();
      add.mockReturnValue(d.promise);
      act(() => result.current.toggleFavorite("a"));
      expect(result.current.isFavorite("a")).toBe(true);
      expect(result.current.isPending("a")).toBe(true);
      expect(add).toHaveBeenCalledWith("a");
      await act(async () => {
        d.resolve();
      });
      expect(result.current.isFavorite("a")).toBe(true);
      expect(result.current.isPending("a")).toBe(false);
    });

    it("remove is optimistic and calls removeFavorite", async () => {
      const { result } = await ready(["a"]);
      const d = deferred<void>();
      remove.mockReturnValue(d.promise);
      act(() => result.current.toggleFavorite("a"));
      expect(result.current.isFavorite("a")).toBe(false);
      expect(remove).toHaveBeenCalledWith("a");
      expect(add).not.toHaveBeenCalled();
      await act(async () => {
        d.resolve();
      });
      expect(result.current.isFavorite("a")).toBe(false);
    });

    it("failed add is reverted (heart flips back), pending cleared", async () => {
      const { result } = await ready();
      const d = deferred<void>();
      add.mockReturnValue(d.promise);
      act(() => result.current.toggleFavorite("a"));
      await act(async () => {
        d.reject(new Error("401"));
      });
      expect(result.current.isFavorite("a")).toBe(false);
      expect(result.current.isPending("a")).toBe(false);
    });

    it("failed remove is reverted (heart is filled again)", async () => {
      const { result } = await ready(["a"]);
      const d = deferred<void>();
      remove.mockReturnValue(d.promise);
      act(() => result.current.toggleFavorite("a"));
      await act(async () => {
        d.reject(new Error("500"));
      });
      expect(result.current.isFavorite("a")).toBe(true);
    });

    it("toggling one id does not affect others, and pending is per id", async () => {
      const { result } = await ready(["b"]);
      add.mockReturnValue(deferred<void>().promise);
      act(() => result.current.toggleFavorite("a"));
      expect(result.current.isFavorite("b")).toBe(true);
      expect(result.current.isPending("b")).toBe(false);
    });

    it("toggle twice sequentially (add then remove) ends unfavorited", async () => {
      const { result } = await ready();
      add.mockResolvedValue();
      remove.mockResolvedValue();
      await act(async () => result.current.toggleFavorite("a"));
      await act(async () => result.current.toggleFavorite("a"));
      expect(result.current.isFavorite("a")).toBe(false);
      expect(add).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it("a late failure does not resurrect a favorite after logout", async () => {
      const { result, rerender } = await ready(["a"]);
      const d = deferred<void>();
      remove.mockReturnValue(d.promise);
      act(() => result.current.toggleFavorite("a"));
      setAuth(null);
      rerender();
      await act(async () => {
        d.reject(new Error("401"));
      });
      expect(result.current.isFavorite("a")).toBe(false);
    });
  });

  it("throws outside a provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useFavorites())).toThrow(/FavoritesProvider/);
  });
});
