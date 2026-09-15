"use client";

import Link from "next/link";
import type { Ref } from "react";
import { motion } from "motion/react";
import WindLines from "@/components/ui/WindLines";
import FavoriteHeart from "@/features/favorites/components/FavoriteHeart";
import { emergeItem } from "@/lib/motion";
import type { Fragrance } from "@/features/fragrances/types/fragrance.types";

type FragranceCardProps = {
  fragrance: Fragrance;
  ref?: Ref<HTMLLIElement>;
};

export default function FragranceCard({ fragrance, ref }: FragranceCardProps) {
  return (
    <motion.li ref={ref} layout variants={emergeItem} exit="exit">
      <Link href={`/fragrances/${fragrance.id}`} className="flex flex-col gap-3">
        <div className="relative flex h-[250px] items-center justify-center overflow-hidden rounded-2xl bg-surface/60">
          <div
            className="h-[170px] w-[86px] rounded-t-[40px] rounded-b-lg"
            style={{
              background:
                "repeating-linear-gradient(135deg, var(--color-border) 0 5px, var(--color-background) 5px 10px)",
            }}
          />
          <WindLines
            variant="sw"
            className="pointer-events-none absolute inset-x-0 bottom-4 h-6 w-full opacity-40"
          />

          <FavoriteHeart
            fragranceId={fragrance.id}
            size="sm"
            className="absolute top-3 right-3"
          />
        </div>

        <div>
          <h2 className="font-serif text-2xl leading-tight">
            {fragrance.name}
          </h2>
          <p className="mt-0.5 font-sans text-[13px] font-light text-text-muted">
            {fragrance.brand}
          </p>
        </div>
      </Link>
    </motion.li>
  );
}
