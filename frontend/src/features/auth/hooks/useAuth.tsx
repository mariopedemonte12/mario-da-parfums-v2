"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import * as authApi from "../api/auth.api";
import type { LoginParams, RegisterParams } from "../types/auth.types";
import type { User } from "../types/user.types";

// Cached UI hint only — never a token/credential. See specs/auth-pages.md
// ("Session hydration") for why this exists: the real session lives in an
// httpOnly cookie the frontend can't read, and there's no GET /auths/me yet
// to ask the backend directly on page load.
const CACHE_KEY = "mdp:auth:user";

// Minimal shape check: the cache is untrusted input (stale schema, manual
// edit, other app on the same origin), so anything that is not a user object
// is discarded instead of exposed as a logged-in `user`.
function isCachedUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "number" &&
    typeof candidate.name === "string" &&
    typeof candidate.email === "string" &&
    (candidate.role === "user" || candidate.role === "admin")
  );
}

function readCachedUser(): User | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (isCachedUser(parsed)) return parsed;

    window.localStorage.removeItem(CACHE_KEY);
    return null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null) {
  try {
    if (user) {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    // localStorage unavailable (private mode, disabled) — the optimistic
    // cache is a convenience, not a requirement, so fail silently.
  }
}

type AuthContextValue = {
  user: User | null;
  isHydrating: boolean;
  login: (params: LoginParams) => Promise<User>;
  register: (params: RegisterParams) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type HydrationState = {
  user: User | null;
  isHydrating: boolean;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ user, isHydrating }, setHydrationState] = useState<HydrationState>({
    user: null,
    isHydrating: true,
  });

  useEffect(() => {
    // Deliberate SSR-safe read: localStorage doesn't exist during server
    // render, so this can't be a lazy useState initializer without causing
    // a hydration mismatch the moment a consumer renders differently for
    // logged-in vs logged-out. Reading it post-mount, in an effect, is the
    // pattern that avoids that mismatch — this synchronizes React state
    // with the external localStorage cache exactly once, on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrationState({ user: readCachedUser(), isHydrating: false });
  }, []);

  const setUser = useCallback((nextUser: User | null) => {
    setHydrationState({ user: nextUser, isHydrating: false });
  }, []);

  const login = useCallback(
    async (params: LoginParams) => {
      const { user: loggedInUser } = await authApi.login(params);
      setUser(loggedInUser);
      writeCachedUser(loggedInUser);
      return loggedInUser;
    },
    [setUser]
  );

  const register = useCallback(
    async (params: RegisterParams) => {
      const { user: registeredUser } = await authApi.register(params);
      setUser(registeredUser);
      writeCachedUser(registeredUser);
      return registeredUser;
    },
    [setUser]
  );

  const logout = useCallback(async () => {
    try {
      // Not yet implemented on the backend (no POST /auths/logout) — will
      // 404 until it ships. See specs/auth-pages.md ("logout does not
      // exist"): clearing local state below is best-effort UX only, it does
      // NOT invalidate the httpOnly session cookie server-side. The request
      // failing must not block that, or surface as an uncaught rejection to
      // callers like Navbar's `onClick={logout}`.
      await authApi.logout();
    } catch {
      // Best-effort — local state still clears in `finally` below.
    } finally {
      setUser(null);
      writeCachedUser(null);
    }
  }, [setUser]);

  const value = useMemo(
    () => ({ user, isHydrating, login, register, logout }),
    [user, isHydrating, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
