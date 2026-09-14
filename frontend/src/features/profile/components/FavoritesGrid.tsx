"use client";

import { motion } from "motion/react";

import { emergeContainer, emergeItem } from "@/lib/motion";

import type { Favorite } from "../types/profile.types";

function fragranceSubtitle(fragrance: Favorite["fragrance"]): string {
  return fragrance.olfactoryFamily
    ? `${fragrance.brand} · ${fragrance.olfactoryFamily}`
    : fragrance.brand;
}

export default function FavoritesGrid({
  favorites,
  total,
}: {
  favorites: Favorite[];
  total: number;
}) {
  const extra = total - favorites.length;

  return (
    <section>
      <div className="mb-[18px] flex items-baseline justify-between">
        <h2 className="font-serif text-3xl leading-none">Guardados</h2>
        {extra > 0 && (
          <span className="text-xs font-light tracking-[0.14em] text-text-muted uppercase">
            +{extra} más
          </span>
        )}
      </div>

      {favorites.length === 0 ? (
        <p className="rounded-2xl border border-border px-6 py-10 text-center text-[15px] font-light text-text-muted">
          Todavía no guardaste ningún perfume. Cuando encuentres uno que te
          traiga una escena, guárdalo para volver a él.
        </p>
      ) : (
        <motion.div
          variants={emergeContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-[18px] md:grid-cols-3 lg:grid-cols-4"
        >
          {favorites.map((favorite) => (
            <motion.div
              key={favorite.id}
              variants={emergeItem}
              className="flex flex-col gap-2.5"
            >
              <div
                aria-hidden="true"
                className="flex h-[150px] items-center justify-center rounded-xl bg-surface/40"
              >
                <div
                  className="h-[100px] w-[52px] rounded-[24px_24px_6px_6px]"
                  style={{
                    background:
                      "repeating-linear-gradient(135deg, var(--color-surface) 0px, var(--color-surface) 5px, var(--color-background) 5px, var(--color-background) 10px)",
                  }}
                />
              </div>
              <div className="font-serif text-xl leading-tight">
                {favorite.fragrance.name}
              </div>
              <div className="text-xs font-light text-text-muted">
                {fragranceSubtitle(favorite.fragrance)}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}
