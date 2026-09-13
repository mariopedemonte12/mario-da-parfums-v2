"use client";

import { useState } from "react";

import FragranceList from "@/features/fragrances/components/FragranceList";
import FragranceSearch from "@/features/fragrances/components/FragranceSearch";
import { useFragrances } from "@/features/fragrances/hooks/useFragrance";
import { useDebounce } from "@/features/common/hooks/useDebounce";

export default function FragrancesPage() {
  const [search, setSearch] = useState("");

  const debouncedSearch = useDebounce(search, 500);

  const {
    fragrances,
    loading,
    error,
  } = useFragrances(debouncedSearch);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <section className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-3xl font-bold text-primary">
          Fragrancias
        </h1>

        <p className="mb-8 text-text-muted">
          Explora nuestra colección de perfumes.
        </p>

        <div className="mb-8">
          <FragranceSearch
            value={search}
            onChange={setSearch}
          />
        </div>

        {loading && (
          <p className="text-center text-text-muted">
            Cargando...
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-border bg-surface p-4 text-center text-text">
            {error}
          </p>
        )}

        {!loading && !error && (
          <FragranceList fragrances={fragrances} />
        )}
      </section>
    </main>
  );
}