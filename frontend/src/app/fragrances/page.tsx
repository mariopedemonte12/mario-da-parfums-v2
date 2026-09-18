"use client";

import { useState } from "react";

import FragranceFilters from "@/features/fragrances/components/FragranceFilters";
import FragranceList from "@/features/fragrances/components/FragranceList";
import FragranceLoadMore from "@/features/fragrances/components/FragranceLoadMore";
import FragranceSearch from "@/features/fragrances/components/FragranceSearch";
import { useFragrances } from "@/features/fragrances/hooks/useFragrance";
import { useDebounce } from "@/features/common/hooks/useDebounce";

const LIMIT = 20;

export default function FragrancesPage() {
  const [search, setSearch] = useState("");
  const [concentration, setConcentration] = useState<string | undefined>();
  const [targetAudience, setTargetAudience] = useState<string | undefined>();
  const [longevity, setLongevity] = useState<string | undefined>();

  const debouncedSearch = useDebounce(search, 500);

  const { fragrances, hasMore, loading, loadingMore, error, loadMore } = useFragrances({
    search: debouncedSearch.trim() || undefined,
    concentration,
    targetAudience,
    longevity,
    limit: LIMIT,
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-10 lg:px-14">
      <div className="flex flex-col items-start justify-between gap-6 pb-6 sm:flex-row sm:items-end">
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl">
          Todos los perfumes
        </h1>

        <FragranceSearch value={search} onChange={setSearch} />
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr] lg:gap-12">
        <FragranceFilters
          concentration={concentration}
          onConcentrationChange={setConcentration}
          targetAudience={targetAudience}
          onTargetAudienceChange={setTargetAudience}
          longevity={longevity}
          onLongevityChange={setLongevity}
        />

        <div>
          {loading && fragrances.length === 0 && (
            <p className="py-16 text-center text-text-muted">Cargando...</p>
          )}

          {error && (
            <p className="rounded-lg border border-border bg-surface p-4 text-center text-text">
              {error}
            </p>
          )}

          {!error && !(loading && fragrances.length === 0) && (
            <>
              <FragranceList fragrances={fragrances} />
              <FragranceLoadMore
                hasMore={hasMore}
                loading={loadingMore}
                onLoadMore={loadMore}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
