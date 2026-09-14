"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { emergeContainer } from "@/lib/motion";
import type { Fragrance } from "../types/fragrance.types";
import FragranceCard from "./FragranceCard";

type FragranceListProps = {
  fragrances: Fragrance[];
};

export default function FragranceList({ fragrances }: FragranceListProps) {
  if (fragrances.length === 0) {
    return (
      <p className="py-16 text-center font-serif text-lg text-text-muted italic">
        No encontramos perfumes que coincidan con tu búsqueda.
      </p>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <motion.ul
        variants={emergeContainer}
        initial="hidden"
        animate="show"
        className="relative grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        <AnimatePresence mode="popLayout">
          {fragrances.map((fragrance) => (
            <FragranceCard key={fragrance.id} fragrance={fragrance} />
          ))}
        </AnimatePresence>
      </motion.ul>
    </MotionConfig>
  );
}
