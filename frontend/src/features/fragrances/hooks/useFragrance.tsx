"use client";

import { useEffect, useRef, useState } from "react";
import { getFragrances } from "../api/fragrances.api";
import type { Fragrance, FindFragranceParams } from "../types/fragrance.types";

type FragrancesFilterParams = Omit<FindFragranceParams, "cursor">;

export function useFragrances(params: FragrancesFilterParams) {
  const [fragrances, setFragrances] = useState<Fragrance[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  // Synchronous guard: state is stale inside a handler until the next render,
  // so two loadMore() calls in the same tick would both pass a state check.
  const loadingMoreRef = useRef(false);

  const { search, concentration, targetAudience, longevity, limit } = params;

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    async function fetchFirstPage() {
      try {
        // A filter change invalidates any in-flight "load more": its response
        // is discarded, so its loading flag has to be released here.
        loadingMoreRef.current = false;
        setLoadingMore(false);
        setLoading(true);
        setError(null);

        const response = await getFragrances({
          search,
          concentration,
          targetAudience,
          longevity,
          limit,
        });

        if (requestIdRef.current !== requestId) return;

        setFragrances(response.data);
        setNextCursor(response.nextCursor);
      } catch {
        if (requestIdRef.current !== requestId) return;

        setError("No se pudieron cargar los perfumes");
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }

    fetchFirstPage();
  }, [search, concentration, targetAudience, longevity, limit]);

  async function loadMore() {
    if (!nextCursor || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    const requestId = requestIdRef.current;

    try {
      setLoadingMore(true);
      setError(null);

      const response = await getFragrances({
        search,
        concentration,
        targetAudience,
        longevity,
        limit,
        cursor: nextCursor,
      });

      if (requestIdRef.current !== requestId) return;

      setFragrances((prev) => [...prev, ...response.data]);
      setNextCursor(response.nextCursor);
    } catch {
      if (requestIdRef.current !== requestId) return;

      setError("No se pudieron cargar más perfumes");
    } finally {
      if (requestIdRef.current === requestId) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }

  return {
    fragrances,
    hasMore: nextCursor !== null,
    loading,
    loadingMore,
    error,
    loadMore,
  };
}
