"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { ApiError } from "@/lib/api/errors";

import { getFavorites, getUser } from "../api/profile.api";
import type { Favorite, UserProfile } from "../types/profile.types";

const FAVORITES_PAGE = 1;
const FAVORITES_LIMIT = 20;

type ProfileState = {
  profile: UserProfile | null;
  favorites: Favorite[];
  favoritesTotal: number;
  loading: boolean;
  error: string | null;
  sessionExpired: boolean;
};

const initialState: ProfileState = {
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
  const { user, logout } = useAuth();
  const [state, setState] = useState<ProfileState>(initialState);

  useEffect(() => {
    if (!user) {
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
          profile,
          favorites: favoritesPage.data,
          favoritesTotal: favoritesPage.total,
          loading: false,
          error: null,
          sessionExpired: false,
        });
      } catch (err) {
        if (cancelled) return;

        if (err instanceof ApiError && err.status === 401) {
          logout();
          setState(sessionExpiredState);
          return;
        }

        setState((current) => ({
          ...current,
          loading: false,
          error: "No se pudo cargar tu perfil.",
        }));
      }
    }

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [user, logout]);

  if (!user) {
    return sessionExpiredState;
  }

  return state;
}
