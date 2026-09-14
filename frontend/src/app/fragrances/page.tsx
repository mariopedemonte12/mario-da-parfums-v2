"use client";

import { useRef, useState } from "react";

import FragranceFilters from "@/features/fragrances/components/FragranceFilters";
import FragranceList from "@/features/fragrances/components/FragranceList";
import FragrancePagination from "@/features/fragrances/components/FragrancePagination";
import FragranceSearch from "@/features/fragrances/components/FragranceSearch";
import { useFragrances } from "@/features/fragrances/hooks/useFragrance";
import { useDebounce } from "@/features/common/hooks/useDebounce";

const LIMIT = 20;

export default function FragrancesPage() {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [concentration, setConcentration] = useState<string | undefined>();
  const [targetAudience, setTargetAudience] = useState<string | undefined>();
  const [longevity, setLongevity] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const resultsTopRef = useRef<HTMLHeadingElement>(null);

  const debouncedName = useDebounce(name, 500);
  const debouncedBrand = useDebounce(brand, 500);

  const { fragrances, total, totalPages, loading, error } = useFragrances({
    name: debouncedName || undefined,
    brand: debouncedBrand || undefined,
    concentration,
    targetAudience,
    longevity,
    page,
    limit: LIMIT,
  });

  function handleNameChange(value: string) {
    setName(value);
    setPage(1);
  }

  function handleBrandChange(value: string) {
    setBrand(value);
    setPage(1);
  }

  function handleConcentrationChange(value: string | undefined) {
    setConcentration(value);
    setPage(1);
  }

  function handleTargetAudienceChange(value: string | undefined) {
    setTargetAudience(value);
    setPage(1);
  }

  function handleLongevityChange(value: string | undefined) {
    setLongevity(value);
    setPage(1);
  }

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
    resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-10 lg:px-14">
      <div className="flex flex-col items-start justify-between gap-6 pb-6 sm:flex-row sm:items-end">
        <h1
          ref={resultsTopRef}
          className="font-serif text-4xl sm:text-5xl lg:text-6xl"
        >
          Todos los perfumes{" "}
          <span className="ml-3 align-middle font-sans text-sm tracking-[0.14em] text-text-muted">
            {total}
          </span>
        </h1>

        <FragranceSearch value={name} onChange={handleNameChange} />
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr] lg:gap-12">
        <FragranceFilters
          brand={brand}
          onBrandChange={handleBrandChange}
          concentration={concentration}
          onConcentrationChange={handleConcentrationChange}
          targetAudience={targetAudience}
          onTargetAudienceChange={handleTargetAudienceChange}
          longevity={longevity}
          onLongevityChange={handleLongevityChange}
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
              <FragrancePagination
                page={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
