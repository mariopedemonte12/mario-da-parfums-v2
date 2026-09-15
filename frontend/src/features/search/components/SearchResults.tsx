"use client";

import Link from "next/link";

import BottlePlaceholder from "@/components/ui/BottlePlaceholder";
import WindLines from "@/components/ui/WindLines";
import { Button } from "@/components/ui/button";
import FavoriteHeart from "@/features/favorites/components/FavoriteHeart";
import type { FragranceMatch, SearchStatus } from "../types/search.types";

type SearchResultsProps = {
  status: SearchStatus;
  query: string;
  matches: FragranceMatch[];
  onReset: () => void;
  onRetry: () => void;
};

export default function SearchResults({
  status,
  query,
  matches,
  onReset,
  onRetry,
}: SearchResultsProps) {
  const [protagonist, ...secondary] = matches;

  return (
    <section className="relative flex min-h-[calc(100vh-160px)] flex-col px-6 pt-6 pb-10 md:px-14">
      <div className="flex flex-col gap-4 pb-4 md:flex-row md:items-center md:justify-between">
        <p className="max-w-2xl font-serif text-lg text-text-muted italic md:text-2xl">
          “{query}”
        </p>
        <Button
          variant="outline"
          className="self-start rounded-full md:self-auto"
          onClick={onReset}
        >
          ← Otra búsqueda
        </Button>
      </div>

      {status === "loading" && <SearchLoading />}
      {status === "error" && <SearchError onRetry={onRetry} />}
      {status === "empty" && <SearchEmpty />}

      {status === "success" && protagonist && (
        <div className="relative flex flex-1 items-center overflow-hidden py-6">
          <WindLines
            variant="wind"
            className="pointer-events-none absolute inset-0 h-full w-full"
          />

          <div className="relative grid w-full gap-10 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-12">
            <div className="grid gap-8 sm:grid-cols-[220px_1fr] sm:items-center">
              <div className="relative mx-auto">
                <BottlePlaceholder className="h-[280px] w-[170px] md:h-[420px] md:w-[260px]" />
                <FavoriteHeart
                  fragranceId={protagonist.fragrance.id}
                  className="absolute top-4 right-4"
                />
              </div>

              <div className="flex flex-col gap-4">
                <p className="text-xs tracking-[0.28em] text-text-muted uppercase">
                  Afinidad {protagonist.affinity}%
                </p>
                <h2 className="font-serif text-4xl md:text-6xl">
                  {protagonist.fragrance.name}
                </h2>
                {protagonist.fragrance.description && (
                  <p className="max-w-md text-text-muted">
                    {protagonist.fragrance.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-text-muted">
                  {[
                    protagonist.fragrance.olfactoryFamily,
                    protagonist.fragrance.brand,
                    protagonist.fragrance.longevity,
                  ]
                    .filter((tag): tag is string => Boolean(tag))
                    .map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border px-3 py-1"
                      >
                        {tag}
                      </span>
                    ))}
                </div>
                <Button asChild className="mt-2 w-fit rounded-full">
                  <Link href={`/fragrances/${protagonist.fragrance.id}`}>
                    Ver perfume
                  </Link>
                </Button>
              </div>
            </div>

            {secondary.length > 0 && (
              <div className="grid gap-4">
                {secondary.map((match) => (
                  <Link
                    key={match.fragrance.id}
                    href={`/fragrances/${match.fragrance.id}`}
                    className="grid grid-cols-[64px_1fr_auto_auto] items-center gap-4 rounded-2xl border border-border bg-background/70 p-3.5 transition-colors hover:border-primary"
                  >
                    <BottlePlaceholder className="h-24 w-16" />
                    <div>
                      <div className="font-serif text-2xl leading-tight">
                        {match.fragrance.name}
                      </div>
                      <div className="mt-1 text-sm text-text-muted">
                        {[match.fragrance.brand, match.fragrance.olfactoryFamily]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <div className="text-xs tracking-[0.1em] text-text-muted">
                      {match.affinity}%
                    </div>
                    <FavoriteHeart fragranceId={match.fragrance.id} size="sm" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function SearchLoading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <WindLines variant="sw" className="h-10 w-40" />
      <p className="font-serif text-2xl text-text-muted italic">
        El viento está buscando tu perfume…
      </p>
    </div>
  );
}

function SearchEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="font-serif text-3xl italic">
        El viento no trajo nada esta vez.
      </p>
      <p className="max-w-md text-text-muted">
        Prueba a describir la escena de otra forma: un lugar, una estación,
        una textura.
      </p>
    </div>
  );
}

function SearchError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="font-serif text-3xl italic">
        El viento se perdió en el camino.
      </p>
      <p className="max-w-md text-text-muted">
        Algo falló buscando tu perfume. Intenta de nuevo en un momento.
      </p>
      <Button variant="outline" className="rounded-full" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
