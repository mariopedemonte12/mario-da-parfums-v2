// @vitest-environment jsdom
// Spec sources: specs/user-profile.md ("Any 401 ... session ended", "Any other
// error", "user is null when /profile mounts"), specs/auth-pages.md (session
// hydration: consumers must wait for isHydrating before deciding).
//
// Decision table (isHydrating, user, API outcome) -> result:
//   hydrating, *, *            -> loading, NOT sessionExpired, no requests
//   done, null, *              -> sessionExpired, no requests
//   done, user, ok             -> data
//   done, user, 401 (either)   -> logout() called, sessionExpired
//   done, user, other failure  -> generic error, NOT sessionExpired, no logout
import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/features/auth/types/user.types";
import { ApiError } from "@/lib/api/errors";
import { deferred } from "@/test/fetchMock";

import { getFavorites, getUser } from "../api/profile.api";
import type { UserProfile } from "../types/profile.types";
import { useProfile } from "./useProfile";

const auth = vi.hoisted(() => ({
  value: { user: null as unknown, isHydrating: true, logout: (() => {}) as () => void },
}));

vi.mock("@/features/auth/hooks/useAuth", () => ({ useAuth: () => auth.value }));
vi.mock("../api/profile.api", () => ({ getUser: vi.fn(), getFavorites: vi.fn() }));

const mockedGetUser = vi.mocked(getUser);
const mockedGetFavorites = vi.mocked(getFavorites);

const userA: User = {
  id: 1,
  name: "a",
  email: "a@x.co",
  role: "user",
  photoS3Key: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const userB: User = { ...userA, id: 2, name: "b", email: "b@x.co" };
const profileOf = (u: User) => ({ ...u }) as unknown as UserProfile;
const page = (ids: string[]) =>
  ({ data: ids.map((id) => ({ fragrance: { id } })), total: ids.length }) as never;

const logout = vi.fn();
function setAuth(user: User | null, isHydrating = false) {
  auth.value = { user, isHydrating, logout };
}

beforeEach(() => {
  logout.mockReset();
  mockedGetUser.mockReset();
  mockedGetFavorites.mockReset();
  setAuth(null, true);
});

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
const plain = ({ children }: { children: ReactNode }) => <>{children}</>;

describe.each([
  ["plain", plain],
  ["StrictMode", strict],
])("useProfile (%s)", (_label, wrapper) => {
  const setup = () => renderHook(() => useProfile(), { wrapper });

  describe("hydration (isHydrating race)", () => {
    it("while hydrating: loading, not session-expired, no request", () => {
      const { result } = setup();
      expect(result.current.loading).toBe(true);
      expect(result.current.sessionExpired).toBe(false);
      expect(mockedGetUser).not.toHaveBeenCalled();
      expect(mockedGetFavorites).not.toHaveBeenCalled();
      expect(logout).not.toHaveBeenCalled();
    });

    it("hydration finishing WITH a user starts loading (never flashes expired) then shows data", async () => {
      mockedGetUser.mockResolvedValue(profileOf(userA));
      mockedGetFavorites.mockResolvedValue(page(["f1"]));
      const seen: { loading: boolean; sessionExpired: boolean }[] = [];
      const { rerender } = renderHook(
        () => {
          const s = useProfile();
          seen.push({ loading: s.loading, sessionExpired: s.sessionExpired });
          return s;
        },
        { wrapper }
      );
      setAuth(userA, false);
      rerender();
      await waitFor(() => expect(seen.at(-1)?.loading).toBe(false));
      expect(seen.some((s) => s.sessionExpired)).toBe(false);
    });

    it("hydration finishing WITHOUT a user: session expired, no request", () => {
      const { result, rerender } = setup();
      setAuth(null, false);
      rerender();
      expect(result.current.sessionExpired).toBe(true);
      expect(result.current.loading).toBe(false);
      expect(mockedGetUser).not.toHaveBeenCalled();
    });
  });

  describe("loading a profile", () => {
    it("success: exposes profile, favorites page and total; requests use the user's id, page 1 limit 20", async () => {
      setAuth(userA);
      mockedGetUser.mockResolvedValue(profileOf(userA));
      mockedGetFavorites.mockResolvedValue(page(["f1", "f2"]));
      const { result } = setup();
      expect(result.current.loading).toBe(true);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.profile).toEqual(profileOf(userA));
      expect(result.current.favorites).toHaveLength(2);
      expect(result.current.favoritesTotal).toBe(2);
      expect(result.current.error).toBeNull();
      expect(result.current.sessionExpired).toBe(false);
      expect(mockedGetUser).toHaveBeenCalledWith(1);
      expect(mockedGetFavorites).toHaveBeenCalledWith(1, 20);
    });

    it.each([
      ["getUser", () => mockedGetUser.mockRejectedValue(new ApiError(401, "x")), () => mockedGetFavorites.mockResolvedValue(page([]))],
      ["getFavorites", () => mockedGetUser.mockResolvedValue(profileOf(userA)), () => mockedGetFavorites.mockRejectedValue(new ApiError(401, "x"))],
    ])("401 from %s: logout() once, session expired, no generic error", async (_n, a, b) => {
      setAuth(userA);
      a();
      b();
      const { result } = setup();
      await waitFor(() => expect(result.current.sessionExpired).toBe(true));
      expect(logout).toHaveBeenCalled();
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it.each([
      ["500", new ApiError(500, "boom")],
      ["403", new ApiError(403, "forbidden")],
      ["network", new TypeError("Failed to fetch")],
    ])("%s: generic message, not session-expired, no logout", async (_n, err) => {
      setAuth(userA);
      mockedGetUser.mockRejectedValue(err);
      mockedGetFavorites.mockResolvedValue(page([]));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBe("No se pudo cargar tu perfil.");
      expect(result.current.sessionExpired).toBe(false);
      expect(logout).not.toHaveBeenCalled();
    });

    it("unmount before the responses arrive: nothing throws when they land", async () => {
      setAuth(userA);
      const u = deferred<UserProfile>();
      mockedGetUser.mockReturnValue(u.promise);
      mockedGetFavorites.mockResolvedValue(page([]));
      const { unmount } = setup();
      unmount();
      await act(async () => {
        u.resolve(profileOf(userA));
      });
    });

    it("a 401 arriving after unmount does not call logout (cancelled request)", async () => {
      setAuth(userA);
      const u = deferred<UserProfile>();
      mockedGetUser.mockReturnValue(u.promise);
      mockedGetFavorites.mockResolvedValue(page([]));
      const { unmount } = setup();
      unmount();
      await act(async () => {
        u.reject(new ApiError(401, "x"));
      });
      expect(logout).not.toHaveBeenCalled();
    });
  });

  describe("session changes while mounted", () => {
    it("user logs out after loading: becomes session-expired (redirect condition), profile hidden", async () => {
      setAuth(userA);
      mockedGetUser.mockResolvedValue(profileOf(userA));
      mockedGetFavorites.mockResolvedValue(page(["f1"]));
      const { result, rerender } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      setAuth(null);
      rerender();
      expect(result.current.sessionExpired).toBe(true);
    });

    it("out-of-order responses: a slow response for user A must not overwrite user B's profile", async () => {
      setAuth(userA);
      const slowA = deferred<UserProfile>();
      mockedGetUser.mockImplementation((id) =>
        id === 1 ? slowA.promise : Promise.resolve(profileOf(userB))
      );
      mockedGetFavorites.mockResolvedValue(page([]));
      const { result, rerender } = setup();
      setAuth(userB);
      rerender();
      await waitFor(() => expect(result.current.profile).toEqual(profileOf(userB)));
      await act(async () => {
        slowA.resolve(profileOf(userA));
      });
      expect(result.current.profile).toEqual(profileOf(userB));
    });

    // BUG (medium, privacy/flash): the hook keeps `state` across user changes
    // and never resets it. When the session switches from user A to user B
    // without unmounting (login as another user via the same provider), B's
    // page renders A's profile and favorites, with loading=false, until B's
    // requests land. Repro: load profile of user 1, then make auth.user = user 2.
    it.fails("BUG: switching user does not show the previous user's profile while loading", async () => {
      setAuth(userA);
      mockedGetUser.mockResolvedValueOnce(profileOf(userA));
      mockedGetFavorites.mockResolvedValueOnce(page(["fa"]));
      const { result, rerender } = setup();
      await waitFor(() => expect(result.current.profile).toEqual(profileOf(userA)));
      const pending = deferred<UserProfile>();
      mockedGetUser.mockReturnValue(pending.promise);
      mockedGetFavorites.mockResolvedValue(page([]));
      setAuth(userB);
      rerender();
      expect(result.current.profile).not.toEqual(profileOf(userA));
      expect(result.current.loading).toBe(true);
    });
  });
});
