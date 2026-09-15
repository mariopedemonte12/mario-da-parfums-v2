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

        const first = await getListings({ fragranceId, limit: 100 });
        let data = first.data;

        for (let page = 2; page <= first.meta.totalPages; page++) {
          const next = await getListings({ fragranceId, limit: 100, page });
          data = data.concat(next.data);
        }

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
