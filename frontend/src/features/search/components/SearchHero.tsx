"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight } from "lucide-react";

import WindLines from "@/components/ui/WindLines";

const SUGGESTIONS = [
  { short: "lluvia en Kioto", full: "una tarde de lluvia en Kioto" },
  { short: "cuero y biblioteca", full: "cuero y biblioteca" },
  { short: "higo, mar", full: "higo fresco, mar" },
];

type SearchHeroProps = {
  onSearch: (query: string) => void;
};

export default function SearchHero({ onSearch }: SearchHeroProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSearch(value);
  }

  function handleSuggestion(full: string) {
    setValue(full);
    onSearch(full);
  }

  return (
    <section className="relative flex min-h-[calc(100vh-160px)] flex-col items-center justify-center gap-8 overflow-hidden px-6 py-16 md:gap-9 md:px-14">
      <WindLines
        variant="wind"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      <p className="relative text-[11px] font-light tracking-[0.28em] text-text-muted uppercase md:text-[13px]">
        Perfumería guiada por lo que sientes
      </p>

      <h1 className="relative max-w-3xl text-center font-serif text-[48px] leading-[1.05] text-balance md:text-[76px]">
        Cuéntanos la escena.{" "}
        <em className="font-normal text-text-muted italic">El viento</em> trae
        el perfume.
      </h1>

      <form onSubmit={handleSubmit} className="relative mt-2 w-full max-w-[720px]">
        <WindLines
          variant="sw"
          className="pointer-events-none absolute top-1/2 right-[-90px] hidden h-[60px] w-[200px] -translate-y-1/2 md:block"
        />

        <div className="flex h-[58px] items-center gap-3 rounded-full border border-border bg-background pr-1.5 pl-6 shadow-[0_12px_40px_-24px_rgba(39,40,41,0.35)] md:h-[68px] md:gap-4 md:pr-2.5 md:pl-7">
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Describe lo que buscas"
            aria-label="Describe lo que buscas"
            className="min-w-0 flex-1 border-0 bg-transparent font-serif text-[19px] italic text-text outline-none placeholder:text-text-muted md:text-2xl"
          />
          <button
            type="submit"
            disabled={value.trim().length === 0}
            aria-label="Buscar"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-primary text-background transition-opacity disabled:opacity-40 md:h-12 md:w-auto md:px-6"
          >
            <span className="hidden font-sans text-[13px] tracking-[0.12em] uppercase md:inline">
              Buscar
            </span>
            <ArrowRight className="size-4 md:hidden" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] text-text-muted md:text-xs">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.full}
              type="button"
              onClick={() => handleSuggestion(suggestion.full)}
              className="rounded-full border border-border px-3.5 py-1.5 transition-colors hover:border-primary hover:text-primary"
            >
              <span className="md:hidden">{suggestion.short}</span>
              <span className="hidden md:inline">{suggestion.full}</span>
            </button>
          ))}
        </div>
      </form>
    </section>
  );
}
