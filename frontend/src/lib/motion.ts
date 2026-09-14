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
 *
 * With AnimatePresence (mode="popLayout"), the same "exit" variant reads as the
 * wind carrying content away to the left as the next batch blows in from the right —
 * give exiting elements `exit="exit"` explicitly (AnimatePresence doesn't propagate
 * it from the container the way "show" propagates from `animate`).
 */
export const emergeTransition: Transition = {
  duration: 1.2,
  ease: [0.2, 0.7, 0.2, 1],
}

const emergeExitTransition: Transition = {
  duration: 0.5,
  ease: [0.4, 0, 1, 1],
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
  exit: {
    opacity: 0,
    x: -120,
    transition: emergeExitTransition,
  },
}
