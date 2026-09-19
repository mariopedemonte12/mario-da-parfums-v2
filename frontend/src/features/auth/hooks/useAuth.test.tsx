// @vitest-environment jsdom
// Spec sources: specs/auth-pages.md ("Session hydration", "useAuth contract",
// no token stored), specs/auth-logout-conflict-messages.md (real logout, 204),
// specs/register-conflict-errors.md. The real API layer runs on top of a
// stubbed `fetch`, so URL/method/credentials are asserted too.
//
// Session state machine (0-switch):
//   hydrating --mount(cache present)--> loggedIn(cached)
//   hydrating --mount(no/corrupt cache)--> loggedOut
//   loggedOut --login ok--> loggedIn ; loggedOut --login fail--> loggedOut
//   loggedOut --register ok--> loggedIn ; --register fail--> loggedOut
//   loggedIn --logout (any outcome)--> loggedOut
//   loggedIn --login ok (other user)--> loggedIn(other)
import { StrictMode, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { jsonResponse, stubFetch } from "@/test/fetchMock";

import type { User } from "../types/user.types";
import { AuthProvider, useAuth } from "./useAuth";

const CACHE_KEY = "mdp:auth:user";
const alice: User = {
  id: 1,
  name: "alice",
  email: "alice@example.com",
  role: "user",
  photoS3Key: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const bob: User = { ...alice, id: 2, name: "bob", email: "bob@example.com" };

const plain = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const strict = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <AuthProvider>{children}</AuthProvider>
  </StrictMode>
);

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each([
  ["plain", plain],
  ["StrictMode", strict],
])("useAuth (%s)", (_label, wrapper) => {
  function setup() {
    const snapshots: { user: User | null; isHydrating: boolean }[] = [];
    const hook = renderHook(
      () => {
        const auth = useAuth();
        snapshots.push({ user: auth.user, isHydrating: auth.isHydrating });
        return auth;
      },
      { wrapper }
    );
    return { ...hook, snapshots };
  }

  describe("hydration", () => {
    it("first render is hydrating with no user (never claims logged-in before reading the cache)", () => {
      const { snapshots } = setup();
      expect(snapshots[0]).toEqual({ user: null, isHydrating: true });
    });

    it("no cache: ends hydration logged out", () => {
      const { result } = setup();
      expect(result.current.isHydrating).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it("cached user: hydrates it, and isHydrating never flips to false while user is still null (race guard)", () => {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(alice));
      const { result, snapshots } = setup();
      expect(result.current.user).toEqual(alice);
      expect(result.current.isHydrating).toBe(false);
      // Regression guard for the isHydrating race: no committed render may show
      // "done hydrating" and "logged out" when a session is cached.
      expect(snapshots.filter((s) => !s.isHydrating && s.user === null)).toEqual([]);
    });

    it("corrupt JSON in the cache: logged out, no throw", () => {
      window.localStorage.setItem(CACHE_KEY, "{not json");
      const { result } = setup();
      expect(result.current.user).toBeNull();
      expect(result.current.isHydrating).toBe(false);
    });

    it("localStorage throwing on read (blocked storage): logged out, hydration finishes", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });
      const { result } = setup();
      expect(result.current.user).toBeNull();
      expect(result.current.isHydrating).toBe(false);
    });

    it.each(["true", "123", "[]", "\"str\"", "{}", "{\"id\":\"1\",\"name\":\"a\"}"])("an invalid cache (%s) is ignored and cleared", (raw) => {
      window.localStorage.setItem(CACHE_KEY, raw);
      const { result } = setup();
      expect(result.current.user).toBeNull();
      expect(result.current.isHydrating).toBe(false);
      expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
    });
  });

  describe("login", () => {
    it("success: POST /auths/login with credentials included, updates user, caches it and resolves with it", async () => {
      const fetchMock = stubFetch(() => jsonResponse({ user: alice }));
      const { result } = setup();
      let returned: User | undefined;
      await act(async () => {
        returned = await result.current.login({ email: alice.email, password: "pw123456" });
      });
      expect(returned).toEqual(alice);
      expect(result.current.user).toEqual(alice);
      expect(result.current.isHydrating).toBe(false);

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/auths\/login$/);
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("include");
      expect(JSON.parse(String(init?.body))).toEqual({ email: alice.email, password: "pw123456" });
    });

    it("never persists a credential: the cache holds only the user fields, no password/token", async () => {
      stubFetch(() => jsonResponse({ user: alice, accessToken: "SECRET-JWT" }));
      const { result } = setup();
      await act(async () => {
        await result.current.login({ email: alice.email, password: "pw123456" });
      });
      const raw = window.localStorage.getItem(CACHE_KEY)!;
      expect(JSON.parse(raw)).toEqual(alice);
      expect(raw).not.toMatch(/SECRET-JWT|pw123456|token|password/i);
      expect(Object.keys(window.localStorage)).toEqual([CACHE_KEY]);
      expect(Object.keys(result.current)).not.toContain("token");
      expect(Object.keys(result.current)).not.toContain("accessToken");
    });

    it("401: rejects with ApiError(401), stays logged out, writes no cache", async () => {
      stubFetch(() => jsonResponse({ statusCode: 401, message: "Invalid credentials" }, 401));
      const { result } = setup();
      let error: unknown;
      await act(async () => {
        await result.current.login({ email: "a@b.co", password: "x" }).catch((e) => (error = e));
      });
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(401);
      expect((error as ApiError).message).toBe("Invalid credentials");
      expect(result.current.user).toBeNull();
      expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it("401 while a session is cached: the existing session is not wiped by a failed re-login", async () => {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(alice));
      stubFetch(() => jsonResponse({ statusCode: 401, message: "nope" }, 401));
      const { result } = setup();
      await act(async () => {
        await result.current.login({ email: "x@y.co", password: "x" }).catch(() => {});
      });
      expect(result.current.user).toEqual(alice);
      expect(window.localStorage.getItem(CACHE_KEY)).not.toBeNull();
    });

    it("network failure: rejects with the fetch error, stays logged out", async () => {
      stubFetch(() => {
        throw new TypeError("Failed to fetch");
      });
      const { result } = setup();
      let error: unknown;
      await act(async () => {
        await result.current.login({ email: "a@b.co", password: "x" }).catch((e) => (error = e));
      });
      expect(error).toBeInstanceOf(TypeError);
      expect(result.current.user).toBeNull();
      expect(result.current.isHydrating).toBe(false);
    });

    it("non-JSON error body still yields an ApiError with the status", async () => {
      stubFetch(() => new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" }));
      const { result } = setup();
      let error: unknown;
      await act(async () => {
        await result.current.login({ email: "a@b.co", password: "x" }).catch((e) => (error = e));
      });
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(502);
    });

    it("login as another user replaces the current one (context and cache)", async () => {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(alice));
      stubFetch(() => jsonResponse({ user: bob }));
      const { result } = setup();
      await act(async () => {
        await result.current.login({ email: bob.email, password: "pw123456" });
      });
      expect(result.current.user).toEqual(bob);
      expect(JSON.parse(window.localStorage.getItem(CACHE_KEY)!)).toEqual(bob);
    });

    it("still logs in when localStorage writes fail (private mode)", async () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      stubFetch(() => jsonResponse({ user: alice }));
      const { result } = setup();
      await act(async () => {
        await result.current.login({ email: alice.email, password: "pw123456" });
      });
      expect(result.current.user).toEqual(alice);
    });
  });

  describe("register", () => {
    it("success: POST /auths/register, user set and cached", async () => {
      const fetchMock = stubFetch(() => jsonResponse({ user: alice }, 201));
      const { result } = setup();
      await act(async () => {
        await result.current.register({ name: "alice", email: alice.email, password: "pw123456" });
      });
      expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/auths\/register$/);
      expect(result.current.user).toEqual(alice);
      expect(JSON.parse(window.localStorage.getItem(CACHE_KEY)!)).toEqual(alice);
    });

    it("409: rejects with ApiError(409) carrying the backend message; state and cache untouched", async () => {
      stubFetch(() => jsonResponse({ statusCode: 409, message: "Name already taken" }, 409));
      const { result } = setup();
      let error: unknown;
      await act(async () => {
        await result.current
          .register({ name: "alice", email: "n@e.co", password: "pw123456" })
          .catch((e) => (error = e));
      });
      expect((error as ApiError).statusCode).toBe(409);
      expect((error as ApiError).message).toBe("Name already taken");
      expect(result.current.user).toBeNull();
      expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it("400 validation: field errors survive on the ApiError", async () => {
      const errors = [{ field: "email", errors: [{ code: "IS_EMAIL" }] }];
      stubFetch(() => jsonResponse({ statusCode: 400, message: "Validation failed", errors }, 400));
      const { result } = setup();
      let error: unknown;
      await act(async () => {
        await result.current
          .register({ name: "a", email: "bad", password: "x" })
          .catch((e) => (error = e));
      });
      expect((error as ApiError).fieldError("email")?.errors[0].code).toBe("IS_EMAIL");
    });
  });

  describe("logout", () => {
    async function loggedIn() {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(alice));
      return setup();
    }

    it("204 from the backend: POST /auths/logout with credentials, clears user and cache, resolves", async () => {
      const fetchMock = stubFetch(() => new Response(null, { status: 204 }));
      const { result } = await loggedIn();
      await act(async () => {
        await expect(result.current.logout()).resolves.toBeUndefined();
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/auths\/logout$/);
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("include");
      expect(result.current.user).toBeNull();
      expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it.each([
      ["404", () => jsonResponse({ statusCode: 404, message: "nf" }, 404)],
      ["500", () => jsonResponse({ statusCode: 500, message: "boom" }, 500)],
      ["401 (session already expired)", () => jsonResponse({ statusCode: 401, message: "x" }, 401)],
    ])("server %s: still clears local state and does not reject", async (_n, respond) => {
      stubFetch(respond);
      const { result } = await loggedIn();
      await act(async () => {
        await expect(result.current.logout()).resolves.toBeUndefined();
      });
      expect(result.current.user).toBeNull();
      expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it("network failure: still clears local state and does not reject", async () => {
      stubFetch(() => {
        throw new TypeError("Failed to fetch");
      });
      const { result } = await loggedIn();
      await act(async () => {
        await expect(result.current.logout()).resolves.toBeUndefined();
      });
      expect(result.current.user).toBeNull();
    });

    it("logout when already logged out is harmless", async () => {
      stubFetch(() => new Response(null, { status: 204 }));
      const { result } = setup();
      await act(async () => {
        await result.current.logout();
      });
      expect(result.current.user).toBeNull();
      expect(result.current.isHydrating).toBe(false);
    });

    it("login after logout works and restores the cache", async () => {
      stubFetch((url) =>
        url.endsWith("/auths/logout") ? new Response(null, { status: 204 }) : jsonResponse({ user: bob })
      );
      const { result } = await loggedIn();
      await act(async () => {
        await result.current.logout();
      });
      await act(async () => {
        await result.current.login({ email: bob.email, password: "pw123456" });
      });
      expect(result.current.user).toEqual(bob);
    });
  });

  it("login/register/logout keep a stable identity across state changes (effects depending on them must not loop)", async () => {
    stubFetch(() => jsonResponse({ user: alice }));
    const { result } = setup();
    const before = { l: result.current.login, r: result.current.register, o: result.current.logout };
    await act(async () => {
      await result.current.login({ email: alice.email, password: "pw123456" });
    });
    expect(result.current.login).toBe(before.l);
    expect(result.current.register).toBe(before.r);
    expect(result.current.logout).toBe(before.o);
  });
});

describe("useAuth outside a provider", () => {
  it("throws a descriptive error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
  });
});
