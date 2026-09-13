"use client";

type FragranceSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function FragranceSearch({
  value,
  onChange,
}: FragranceSearchProps) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Buscar perfume..."
    />
  );
}