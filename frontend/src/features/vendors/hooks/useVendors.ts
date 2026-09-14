"use client";

import { useEffect, useState } from "react";
import { getVendors } from "../api/vendors.api";
import type { Vendor } from "../types/vendor.types";

export function useVendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchVendors() {
      try {
        setLoading(true);
        setError(null);

        const first = await getVendors(1, 100);
        let data = first.data;

        for (let page = 2; page <= first.meta.totalPages; page++) {
          const next = await getVendors(page, 100);
          data = data.concat(next.data);
        }

        if (!cancelled) {
          setVendors(data);
        }
      } catch {
        if (!cancelled) {
          setError("No pudimos cargar las tiendas");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchVendors();

    return () => {
      cancelled = true;
    };
  }, []);

  return { vendors, loading, error };
}
