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

/**
 * /login ↔ /register swap — "el viento se lleva un panel y trae el otro".
 * Kept as two real routes (see specs/auth-pages.md) — this is not
 * client-side tab-state.
 *
 * NOT consumed via AnimatePresence/`variants` — Next.js App Router swaps
 * `{children}` between sibling routes as one atomic replace, giving
 * AnimatePresence no real "old and new both present" moment to detect and
 * defer, no matter which file (layout vs template) owns the animated
 * element (confirmed by watching it break two different ways: the exiting
 * panel either flashed to the *new* route's content mid-exit, or the exit
 * simply never played at all). `features/auth/components/AuthPanelTransition.tsx`
 * instead calls `animate()` (from `motion/react`) imperatively on a stable
 * DOM ref it owns itself: play `exit` on the *current* DOM (still showing the old
 * route, since nothing has navigated yet) → only then `router.push` → then
 * play `show` once the new route's content is in. Fully decoupled from
 * Next's own mount/unmount timing, so it can't be undermined by it.
 */
export const authPanelSweep: Variants = {
  hidden: { opacity: 0, x: 240 },
  show: { opacity: 1, x: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, x: -240, transition: { duration: 0.6, ease: [0.3, 0, 0.2, 1] } },
}
