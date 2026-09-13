import { cn } from "@/lib/utils"

type WindLinesVariant = "wind" | "sw" | "divider"

type WindPath = { d: string; strokeWidth: string; opacity?: number }

const VARIANTS: Record<WindLinesVariant, { viewBox: string; paths: WindPath[] }> = {
  // ambient texture — hero backgrounds only (mock's .wind, 4-path hero instance). Do NOT use
  // for thin bars (nav/footer) — squashing this tall viewBox via preserveAspectRatio="none"
  // into a short height mangles the curves. Use "divider" for that instead.
  wind: {
    viewBox: "0 0 1280 600",
    paths: [
      { d: "M1280 250 C1050 235,950 285,760 300 S460 300,300 290 S80 270,-20 285", strokeWidth: "1" },
      { d: "M1280 330 C1120 340,980 300,820 318 S520 345,360 330 S60 320,-20 330", strokeWidth: ".8" },
      { d: "M1280 290 C1000 300,880 265,700 282 S400 300,220 280 S40 280,-20 300", strokeWidth: ".6" },
      { d: "M1280 372 C1060 360,900 385,740 375 S420 358,240 372 S40 380,-20 365", strokeWidth: ".7" },
    ],
  },
  // short/local flourish — search bars, chat bubble, sensei panel (mock's .sw, 3-path hero-search instance)
  sw: {
    viewBox: "0 0 200 60",
    paths: [
      { d: "M200 18 C150 14,110 26,60 22 S20 18,0 26", strokeWidth: "1" },
      { d: "M200 34 C160 40,120 28,70 34 S30 40,0 34", strokeWidth: ".8" },
      { d: "M200 48 C150 44,100 52,50 46 S20 44,0 50", strokeWidth: ".6" },
    ],
  },
  // thin full-width bar — nav/footer dividers (mock's .wind, artboard 1a nav-divider instance,
  // viewBox 0 0 1280 14, per-path opacity baked in rather than a single svg-level opacity).
  // Stroke widths bumped up from the mock's .8/.6 and given a slower "wind-lines--divider"
  // timing (see globals.css) — at this bar's small on-screen height, the mock's literal
  // values read as too thin/fast to register as the intended "brisa" motif.
  divider: {
    viewBox: "0 0 1280 14",
    paths: [
      { d: "M1280 7 C1000 2,800 12,560 7 S200 3,0 8", strokeWidth: "1.6", opacity: 0.55 },
      { d: "M1280 10 C900 12,700 4,420 9 S120 8,0 4", strokeWidth: "1.3", opacity: 0.35 },
    ],
  },
}

interface WindLinesProps {
  /** "wind" = ambient hero/section background texture. "sw" = short local flourish. "divider" = thin full-width nav/footer bar. */
  variant?: WindLinesVariant
  /** Stroke color for every path. Defaults to the design system's secondary token. */
  color?: string
  opacity?: number
  width?: number | string
  height?: number | string
  /** Override the variant's default viewBox (rarely needed). */
  viewBox?: string
  className?: string
}

export default function WindLines({
  variant = "wind",
  color = "var(--color-secondary)",
  opacity = variant === "wind" ? 0.55 : undefined,
  width,
  height,
  viewBox,
  className,
}: WindLinesProps) {
  const preset = VARIANTS[variant]

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn(
        "wind-lines",
        variant === "sw" && "wind-lines--sw",
        variant === "divider" && "wind-lines--divider",
        className,
      )}
      viewBox={viewBox ?? preset.viewBox}
      preserveAspectRatio="none"
      width={width}
      height={height}
      opacity={opacity}
    >
      {preset.paths.map((path) => (
        <path
          key={path.d}
          d={path.d}
          stroke={color}
          strokeWidth={path.strokeWidth}
          opacity={path.opacity}
        />
      ))}
    </svg>
  )
}
