"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/features/auth/hooks/useAuth";

import { addFavorite, listFavoriteIds, removeFavorite } from "../api/favorites.api";

type FavoritesContextValue = {
  loaded: boolean;
  isFavorite: (fragranceId: string) => boolean;
  isPending: (fragranceId: string) => boolean;
  toggleFavorite: (fragranceId: string) => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user, isHydrating } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  // Bumped whenever the session changes (logout / another user). A toggle
  // remembers the value it started under and must not touch state after it
  // changed: its rollback would put a favorite into the wrong user's set.
  const sessionRef = useRef(0);

  useEffect(() => {
    if (isHydrating) return;

    sessionRef.current++;

    if (!user) {
      // Synchronizes React state with the external "is there a session"
      // condition (logout) — same pattern/justification as useAuth.tsx's
      // own post-mount setState.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFavoriteIds(new Set());
      setPendingIds(new Set());
      setLoaded(false);
      return;
    }

    let cancelled = false;

    listFavoriteIds()
      .then((ids) => {
        if (cancelled) return;
        setFavoriteIds(new Set(ids));
        setLoaded(true);
      })
      .catch(() => {
        // Best-effort — hearts stay unfilled until the next mount retries.
      });

    return () => {
      cancelled = true;
    };
  }, [user, isHydrating]);

  function toggleFavorite(fragranceId: string) {
    const wasFavorite = favoriteIds.has(fragranceId);
    const session = sessionRef.current;

    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (wasFavorite) {
        next.delete(fragranceId);
      } else {
        next.add(fragranceId);
      }
      return next;
    });
    setPendingIds((prev) => new Set(prev).add(fragranceId));

    const request = wasFavorite ? removeFavorite(fragranceId) : addFavorite(fragranceId);

    request
      .catch(() => {
        if (sessionRef.current !== session) return;

        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (wasFavorite) {
            next.add(fragranceId);
          } else {
            next.delete(fragranceId);
          }
          return next;
        });
      })
      .finally(() => {
        if (sessionRef.current !== session) return;

        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(fragranceId);
          return next;
        });
      });
  }

  const value: FavoritesContextValue = {
    loaded,
    isFavorite: (fragranceId) => favoriteIds.has(fragranceId),
    isPending: (fragranceId) => pendingIds.has(fragranceId),
    toggleFavorite,
  };

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return context;
}
