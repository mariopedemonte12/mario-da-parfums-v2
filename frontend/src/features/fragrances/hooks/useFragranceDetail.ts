"use client";

import { useEffect, useState } from "react";
import { getFragranceById } from "../api/fragrances.api";
import type { FragranceDetail } from "../types/fragrance.types";

export function useFragranceDetail(id: string) {
  const [fragrance, setFragrance] = useState<FragranceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchFragrance() {
      try {
        setLoading(true);
        setError(null);

        const data = await getFragranceById(id);

        if (!cancelled) {
          setFragrance(data);
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

  return { fragrance, loading, error };
}
