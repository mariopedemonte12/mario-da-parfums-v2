"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { ApiError } from "@/lib/api/errors";

import { getFavorites, getUser } from "../api/profile.api";
import type { Favorite, UserProfile } from "../types/profile.types";

const FAVORITES_PAGE = 1;
const FAVORITES_LIMIT = 20;

type ProfileState = {
  // Owner of the data below; state that belongs to another user is never
  // exposed (see the return at the bottom of the hook).
  userId: number | null;
  profile: UserProfile | null;
  favorites: Favorite[];
  favoritesTotal: number;
  loading: boolean;
  error: string | null;
  sessionExpired: boolean;
};

const initialState: ProfileState = {
  userId: null,
  profile: null,
  favorites: [],
  favoritesTotal: 0,
  loading: true,
  error: null,
  sessionExpired: false,
};

const sessionExpiredState: ProfileState = {
  ...initialState,
  loading: false,
  sessionExpired: true,
};

export function useProfile() {
  const { user, isHydrating, logout } = useAuth();
  const [state, setState] = useState<ProfileState>(initialState);

  useEffect(() => {
    if (isHydrating || !user) {
      return;
    }

    const userId = user.id;
    let cancelled = false;

    async function fetchProfile() {
      try {
        const [profile, favoritesPage] = await Promise.all([
          getUser(userId),
          getFavorites(FAVORITES_PAGE, FAVORITES_LIMIT),
        ]);

        if (cancelled) return;

        setState({
          userId,
          profile,
          favorites: favoritesPage.data,
          favoritesTotal: favoritesPage.total,
          loading: false,
          error: null,
          sessionExpired: false,
        });
      } catch (err) {
        if (cancelled) return;

        if (err instanceof ApiError && err.statusCode === 401) {
          logout();
          setState({ ...sessionExpiredState, userId });
          return;
        }

        setState((current) => ({
          ...(current.userId === userId ? current : initialState),
          userId,
          loading: false,
          error: "No se pudo cargar tu perfil.",
        }));
      }
    }

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [user, isHydrating, logout]);

  if (isHydrating) {
    return initialState;
  }

  if (!user) {
    return sessionExpiredState;
  }

  // State fetched for a different user (A -> B without unmounting) must never
  // be shown to the current one: treat it as not loaded yet.
  return state.userId === user.id ? state : initialState;
}
