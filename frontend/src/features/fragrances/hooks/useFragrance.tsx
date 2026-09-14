"use client";

import { useEffect, useState } from "react";
import { getFragrances } from "../api/fragrances.api";
import type { Fragrance, FindFragranceParams } from "../types/fragrance.types";

const DEFAULT_LIMIT = 20;

export function useFragrances(params: FindFragranceParams) {
  const [fragrances, setFragrances] = useState<Fragrance[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { name, brand, concentration, targetAudience, longevity, page, limit } =
    params;

  useEffect(() => {
    let cancelled = false;

    async function fetchFragrances() {
      try {
        setLoading(true);
        setError(null);

        const response = await getFragrances({
          name,
          brand,
          concentration,
          targetAudience,
          longevity,
          page,
          limit,
        });

        if (cancelled) return;

        setFragrances(response.data);
        setTotal(response.total);
      } catch {
        if (cancelled) return;

        setError("No se pudieron cargar los perfumes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchFragrances();

    return () => {
      cancelled = true;
    };
  }, [name, brand, concentration, targetAudience, longevity, page, limit]);

  const effectiveLimit = limit ?? DEFAULT_LIMIT;
  const totalPages = Math.ceil(total / effectiveLimit);

  return {
    fragrances,
    total,
    totalPages,
    loading,
    error,
  };
}
