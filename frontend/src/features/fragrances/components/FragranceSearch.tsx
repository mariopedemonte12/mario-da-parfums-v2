"use client";

import WindLines from "@/components/ui/WindLines";

type FragranceSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function FragranceSearch({
  value,
  onChange,
}: FragranceSearchProps) {
  return (
    <div className="relative w-full sm:w-[420px]">
      <WindLines
        variant="sw"
        className="pointer-events-none absolute top-1/2 right-[-70px] hidden h-10 w-[130px] -translate-y-1/2 sm:block"
      />
      <div className="flex h-[50px] items-center rounded-full border border-border px-5">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Buscar por nombre"
          className="w-full border-0 bg-transparent font-serif text-lg italic outline-none placeholder:text-text-muted placeholder:not-italic"
        />
      </div>
    </div>
  );
}
