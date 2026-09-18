"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Snapshot of the current dataset's distinct values (backend/src/database/schema/fragrance.schema.ts
// keeps these as free-form varchar, not an enum, so this list can go stale as new data lands —
// there's no distinct-values endpoint yet to source it from live).
const CONCENTRATIONS = [
  "Eau de Toilette",
  "Eau de Parfum",
  "Parfum",
  "Extrait de Parfum",
  "Eau de Cologne",
  "Attar",
  "Concentrate",
  "Oil",
  "Alcohol-Free",
];
const TARGET_AUDIENCES = ["Male", "Female", "Unisex"];
const LONGEVITIES = [
  "Light",
  "Light-Medium",
  "Medium",
  "Medium-Strong",
  "Strong",
  "Very Strong",
];

type FragranceFiltersProps = {
  concentration: string | undefined;
  onConcentrationChange: (value: string | undefined) => void;
  targetAudience: string | undefined;
  onTargetAudienceChange: (value: string | undefined) => void;
  longevity: string | undefined;
  onLongevityChange: (value: string | undefined) => void;
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 border-b border-border pb-2.5 font-sans text-[11px] font-normal tracking-[0.22em] text-text-muted uppercase">
      {children}
    </div>
  );
}

function ComingSoonSection({ label }: { label: string }) {
  return (
    <div className="opacity-50">
      <SectionLabel>
        {label} <span className="normal-case">· Próximamente</span>
      </SectionLabel>
      <div className="flex flex-col gap-1.5 text-text-muted">
        <span>Sin datos disponibles todavía</span>
      </div>
    </div>
  );
}

function ChipFilterSection({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(active ? undefined : option)}
              aria-pressed={active}
              className={cn(
                "h-8 rounded-full border px-3.5 text-xs transition-colors",
                active
                  ? "border-primary bg-primary text-background"
                  : "border-border bg-transparent text-text hover:border-secondary"
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FragranceFilters({
  concentration,
  onConcentrationChange,
  targetAudience,
  onTargetAudienceChange,
  longevity,
  onLongevityChange,
}: FragranceFiltersProps) {
  return (
    <aside className="flex flex-col gap-7 font-sans text-sm font-light">
      <ChipFilterSection
        label="Concentración"
        options={CONCENTRATIONS}
        value={concentration}
        onChange={onConcentrationChange}
      />

      <ChipFilterSection
        label="Audiencia objetivo"
        options={TARGET_AUDIENCES}
        value={targetAudience}
        onChange={onTargetAudienceChange}
      />

      <ChipFilterSection
        label="Duración"
        options={LONGEVITIES}
        value={longevity}
        onChange={onLongevityChange}
      />

      <ComingSoonSection label="Familia" />
    </aside>
  );
}
