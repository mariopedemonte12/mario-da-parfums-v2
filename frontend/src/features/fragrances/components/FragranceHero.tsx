"use client";

import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import WindLines from "@/components/ui/WindLines";
import FavoriteHeart from "@/features/favorites/components/FavoriteHeart";
import { emergeContainer, emergeItem } from "@/lib/motion";
import { cn, formatCurrencyCLP } from "@/lib/utils";
import type { FragranceDetail } from "@/features/fragrances/types/fragrance.types";
import type { Listing } from "@/features/listings/types/listing.types";

type FragranceHeroProps = {
  fragrance: FragranceDetail;
  selectedListing: Listing | null;
  vendorName: string | null;
};

export default function FragranceHero({
  fragrance,
  selectedListing,
  vendorName,
}: FragranceHeroProps) {
  const reducedMotion = useReducedMotion();
  const eyebrow = [fragrance.olfactoryFamily, fragrance.concentration]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,420px)_1fr] md:gap-16">
      <div className="relative flex aspect-[13/16] items-center justify-center overflow-hidden rounded-[20px] bg-surface">
        <WindLines variant="wind" className="absolute inset-0 h-full w-full" opacity={0.4} />
        {fragrance.imageUrl ? (
          // imageUrl comes from the scraper job (arbitrary external stores, see
          // backend/src/fragrances/NOTES.md) — not a fixed set of domains next/image's
          // remotePatterns could allow-list, so a plain <img> is used instead.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fragrance.imageUrl}
            alt={fragrance.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-4/5 w-3/5 items-end justify-center rounded-t-full rounded-b-2xl pb-4 font-mono text-[11px] text-text-muted"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, var(--color-surface) 0 6px, var(--color-background) 6px 12px)",
            }}
          >
            fotografía · frasco
          </div>
        )}

        <FavoriteHeart
          fragranceId={fragrance.id}
          className="absolute top-4 right-4"
        />
      </div>

      <motion.div
        variants={emergeContainer}
        initial={reducedMotion ? "show" : "hidden"}
        animate="show"
        className="flex flex-col justify-center"
      >
        {eyebrow && (
          <motion.p
            variants={emergeItem}
            className="mb-3 font-sans text-xs font-light tracking-[0.28em] text-text-muted uppercase"
          >
            {eyebrow}
          </motion.p>
        )}

        <motion.h1
          variants={emergeItem}
          className="mb-4 font-serif text-5xl leading-none text-primary md:text-7xl"
        >
          {fragrance.name}
        </motion.h1>

        <motion.p variants={emergeItem} className="mb-2 font-sans text-sm text-text-muted">
          {fragrance.brand}
        </motion.p>

        {fragrance.description && (
          <motion.p
            variants={emergeItem}
            className="mb-8 max-w-xl font-sans text-[17px] font-light text-text-muted"
          >
            {fragrance.description}
          </motion.p>
        )}

        {(fragrance.longevity || fragrance.targetAudience) && (
          <motion.p
            variants={emergeItem}
            className="mb-8 font-sans text-[13px] tracking-[0.06em] text-text-muted"
          >
            {[fragrance.longevity, fragrance.targetAudience].filter(Boolean).join(" · ")}
          </motion.p>
        )}

        <motion.div variants={emergeItem} className="flex flex-wrap items-center gap-4">
          <Button
            asChild={Boolean(selectedListing)}
            disabled={!selectedListing}
            size="lg"
            className={cn(
              "h-13 rounded-full px-9 font-sans text-[13px] tracking-[0.14em] uppercase"
            )}
          >
            {selectedListing ? (
              <a href={selectedListing.url} target="_blank" rel="noopener noreferrer">
                Ver en tienda
              </a>
            ) : (
              <span>Ver en tienda</span>
            )}
          </Button>

          {selectedListing && (
            <span className="font-sans text-[13px] tracking-[0.06em] text-text-muted">
              {selectedListing.sizeMl} ml · {formatCurrencyCLP(selectedListing.price)}
              {vendorName ? ` · ${vendorName}` : ""}
            </span>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
