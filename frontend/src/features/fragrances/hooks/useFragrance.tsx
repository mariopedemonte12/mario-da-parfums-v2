"use client";

import { useEffect, useState } from "react";
import { getFragrances } from "../../fragrances/api/fragrances.api";
import type { Fragrance } from "../../fragrances/types/fragrance.types";

export function useFragrances(search: string) {
  const [fragrances, setFragrances] = useState<Fragrance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFragrances() {
      try {
        setLoading(true);
        setError(null);

        const data = await getFragrances(search);

        setFragrances(data);
      } catch {
        setError("No se pudieron cargar los perfumes");
      } finally {
        setLoading(false);
      }
    }

    fetchFragrances();
  }, [search]);

  return {
    fragrances,
    loading,
    error,
  };
}