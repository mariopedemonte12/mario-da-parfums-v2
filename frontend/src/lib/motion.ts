import type { Transition, Variants } from "motion/react"

/**
 * "Emerge" reveal — slide-in-from-right + fade, staggered per child.
 * Matches the mock's .emerge rule: 1.2s cubic-bezier(.2,.7,.2,1), ~200ms stagger per child.
 *
 * Usage:
 *   <motion.div variants={emergeContainer} initial="hidden" animate="show">
 *     <motion.div variants={emergeItem}>...</motion.div>
 *     <motion.div variants={emergeItem}>...</motion.div>
 *   </motion.div>
 */
export const emergeTransition: Transition = {
  duration: 1.2,
  ease: [0.2, 0.7, 0.2, 1],
}

export const emergeContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.2,
    },
  },
}

export const emergeItem: Variants = {
  hidden: { opacity: 0, x: 120 },
  show: {
    opacity: 1,
    x: 0,
    transition: emergeTransition,
  },
}

/**
 * Hero ↔ results swap on submit/reset — the wind sweeps the search pill away
 * to the left and carries the results panel in from the right, unhurried.
 * Both panels are mounted absolutely (see page.tsx) so their exit/enter
 * overlap in time instead of crossfading in place.
 */
export const heroSweep: Variants = {
  hidden: { opacity: 0, x: -200 },
  show: { opacity: 1, x: 0, transition: { duration: 0.9, ease: [0.3, 0, 0.2, 1] } },
  // Delayed so the gust (page.tsx) is already sweeping through before the bar
  // gets carried off — the wind arrives, then takes the search pill with it.
  exit: {
    opacity: 0,
    x: -320,
    transition: { duration: 1, ease: [0.3, 0, 0.2, 1], delay: 0.4 },
  },
}

export const resultsSweep: Variants = {
  hidden: { opacity: 0, x: 360 },
  show: {
    opacity: 1,
    x: 0,
    // Arrives once the gust has largely passed through, so it reads as
    // "carried in by the wind" rather than appearing alongside it.
    transition: { duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 1 },
  },
  exit: { opacity: 0, x: 360, transition: { duration: 0.65, ease: [0.3, 0, 0.2, 1] } },
}
