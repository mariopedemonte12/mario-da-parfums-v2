"use client";

import { useEffect, useState } from "react";
import { getListings } from "../api/listings.api";
import type { Listing } from "../types/listing.types";

export function useListingsByFragrance(fragranceId: string) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchListings() {
      try {
        setLoading(true);
        setError(null);

        let data: Listing[] = [];
        let cursor: number | undefined;

        do {
          const response = await getListings({ fragranceId, limit: 100, cursor });
          data = data.concat(response.data);
          cursor = response.nextCursor ?? undefined;
        } while (cursor !== undefined);

        if (!cancelled) {
          setListings(data);
        }
      } catch {
        if (!cancelled) {
          setError("No pudimos cargar los precios de este perfume");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchListings();

    return () => {
      cancelled = true;
    };
  }, [fragranceId]);

  return { listings, loading, error };
}
