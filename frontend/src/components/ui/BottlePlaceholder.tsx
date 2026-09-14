import { cn } from "@/lib/utils"

type BottlePlaceholderProps = {
  className?: string
}

// The mock's diagonal-stripe placeholder for product photography (repeating-linear-gradient,
// rounded bottle-neck silhouette). Kept as the one placeholder treatment across every screen
// per frontend/CLAUDE.md — do not swap in a real <img> from imageUrl, real photography treatment
// is a separate future change, not a per-screen decision.
export default function BottlePlaceholder({ className }: BottlePlaceholderProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-t-[999px] rounded-b-md", className)}
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, var(--color-surface) 0 6px, var(--color-background) 6px 12px)",
      }}
    />
  )
}
