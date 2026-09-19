"use client";

import { useEffect, useState } from "react";
import { getFragranceById } from "../api/fragrances.api";
import type { FragranceDetail } from "../types/fragrance.types";

export function useFragranceDetail(id: string) {
  const [loaded, setLoaded] = useState<{ id: string; data: FragranceDetail | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchFragrance() {
      try {
        setLoading(true);
        setError(null);
        setLoaded(null);

        const data = await getFragranceById(id);

        if (!cancelled) {
          setLoaded({ id, data });
        }
      } catch {
        if (!cancelled) {
          setError("No pudimos cargar este perfume");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchFragrance();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Data fetched for another id is never exposed for the current one.
  const fragrance = loaded?.id === id ? loaded.data : null;

  return { fragrance, loading, error };
}
