import type { Fragrance } from "../types/fragrance.types";
import FragranceCard from "./FragranceCard";

type FragranceListProps = {
  fragrances: Fragrance[];
};

export default function FragranceList({
  fragrances,
}: FragranceListProps) {
  return (
    <ul>
      {fragrances.map((fragrance) => (
        <FragranceCard
          key={fragrance.id}
          fragrance={fragrance}
        />
      ))}
    </ul>
  );
}