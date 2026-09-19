"use client";

import { useRef, useState } from "react";

import { findFragranceByExactName } from "@/features/fragrances/api/fragrances.api";
import { searchFragrancesByDescription } from "../api/search.api";
import type { FragranceMatch, SearchStatus } from "../types/search.types";

// One protagonist + up to three secondary results, matching artboard 1c's fixed layout.
const RESULTS_TO_FETCH = 4;

export function useFragranceSearch() {
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<FragranceMatch[]>([]);

  // Sequence token: only the latest search()/reset() may write state, so a
  // slow older search can't overwrite a newer one or leave `idle` after reset.
  const sequenceRef = useRef(0);

  async function search(rawQuery: string) {
    const trimmed = rawQuery.trim();

    if (!trimmed) {
      return;
    }

    const sequence = ++sequenceRef.current;

    setQuery(trimmed);
    setStatus("loading");

    try {
      const { results } = await searchFragrancesByDescription(trimmed, RESULTS_TO_FETCH);

      const resolved = await Promise.all(
        results.map(async (result) => {
          const fragrance = await findFragranceByExactName(result.name);

          return fragrance
            ? { fragrance, affinity: Math.round(result.score * 100) }
            : null;
        })
      );

      const found = resolved.filter(
        (match): match is FragranceMatch => match !== null
      );

      if (sequenceRef.current !== sequence) return;

      setMatches(found);
      setStatus(found.length > 0 ? "success" : "empty");
    } catch {
      if (sequenceRef.current !== sequence) return;

      setMatches([]);
      setStatus("error");
    }
  }

  function reset() {
    sequenceRef.current++;
    setStatus("idle");
    setQuery("");
    setMatches([]);
  }

  return { status, query, matches, search, reset };
}
