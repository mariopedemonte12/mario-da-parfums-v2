"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import WindLines from "@/components/ui/WindLines";
import SearchHero from "@/features/search/components/SearchHero";
import SearchResults from "@/features/search/components/SearchResults";
import { useFragranceSearch } from "@/features/search/hooks/useFragranceSearch";
import { heroSweep, resultsSweep } from "@/lib/motion";

// Several wind-line layers, staggered, each sweeping the full width right-to-left —
// "muchos vientos" carrying the search bar out and the results in. Triggered once per
// submit (via gustBurst) rather than tied to the network call, so the gust always plays
// out in full regardless of how fast loading resolves. Starts immediately (before the
// hero even begins to move — see heroSweep's exit delay in lib/motion.ts) so the wind
// visibly arrives first, then "sweeps" the search bar away with it.
const GUST_LAYERS = [
  { top: "4%", peakOpacity: 0.85, delay: 0 },
  { top: "30%", peakOpacity: 0.65, delay: 0.13 },
  { top: "55%", peakOpacity: 0.75, delay: 0.05 },
  { top: "78%", peakOpacity: 0.6, delay: 0.2 },
  { top: "94%", peakOpacity: 0.5, delay: 0.3 },
];

const GUST_DURATION = 2.2;

export default function Home() {
  const { status, query, matches, search, reset } = useFragranceSearch();
  const [gustBurst, setGustBurst] = useState(0);
  const isIdle = status === "idle";

  function handleSearch(rawQuery: string) {
    setGustBurst((n) => n + 1);
    search(rawQuery);
  }

  // Both panels are `position: absolute` (see className below) so they can overlap during the
  // hero<->results crossfade — but that also takes them out of normal flow, so this wrapper's own
  // height never grows to match them. On mobile, results (protagonist + 3 stacked secondary cards)
  // is routinely taller than one viewport, and without this the page's Footer (a normal-flow
  // sibling in the root layout, below this component) sits at the wrapper's fixed min-height and
  // overlaps the overflowing content instead of landing after it. Measuring the currently-relevant
  // panel's real height and applying it as this wrapper's min-height fixes that without touching
  // the (already-tuned) absolute/overlap-based transition itself.
  const heroRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [wrapperHeight, setWrapperHeight] = useState<number>();

  useLayoutEffect(() => {
    const el = isIdle ? heroRef.current : resultsRef.current;
    if (!el) return;

    // `el` is a normal-flow div (see the JSX below) nested *inside* the absolutely-positioned,
    // inset-0 motion.div — necessarily so: a ref on the inset-0 element itself would only ever
    // report the size it's pinned to match (its own parent), never the content's real size, so a
    // ResizeObserver on it would fire once with that borrowed value and then never again as the
    // content inside grows. `scrollHeight` (not the observer's own contentRect) is what actually
    // captures content that overflows this div's box.
    const observer = new ResizeObserver(() => setWrapperHeight(el.scrollHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [isIdle, status, matches.length]);

  return (
    <div className="relative min-h-[calc(100vh-160px)]" style={{ minHeight: wrapperHeight }}>
      {gustBurst > 0 && (
        <div
          key={gustBurst}
          className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
        >
          {GUST_LAYERS.map((layer, index) => (
            <motion.div
              key={index}
              className="absolute inset-x-0 h-[320px] scale-150 blur-[10px] md:blur-[16px]"
              style={{ top: layer.top }}
              initial={{ opacity: 0, x: "115%" }}
              animate={{
                opacity: [0, layer.peakOpacity, layer.peakOpacity, 0],
                x: "-115%",
              }}
              transition={{
                duration: GUST_DURATION,
                delay: layer.delay,
                times: [0, 0.3, 0.75, 1],
                ease: "linear",
              }}
            >
              <WindLines variant="wind" opacity={1} className="h-full w-full" />
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence initial={false}>
        {isIdle ? (
          <motion.div
            key="hero"
            variants={heroSweep}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute inset-0"
          >
            <div ref={heroRef}>
              <SearchHero onSearch={handleSearch} />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="results"
            variants={resultsSweep}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute inset-0"
          >
            <div ref={resultsRef}>
              <SearchResults
                status={status}
                query={query}
                matches={matches}
                onReset={reset}
                onRetry={() => search(query)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
