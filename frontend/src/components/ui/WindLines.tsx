import { cn } from "@/lib/utils"

type WindLinesVariant = "wind" | "sw"

type WindPath = { d: string; strokeWidth: string }

const VARIANTS: Record<WindLinesVariant, { viewBox: string; paths: WindPath[] }> = {
  // ambient texture — hero backgrounds, wide nav/footer dividers (mock's .wind, 4-path hero instance)
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
}

interface WindLinesProps {
  /** "wind" = ambient texture (hero/section backgrounds, wide dividers). "sw" = short local flourish. */
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
  opacity = variant === "wind" ? 0.55 : 1,
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
      className={cn("wind-lines", variant === "sw" && "wind-lines--sw", className)}
      viewBox={viewBox ?? preset.viewBox}
      preserveAspectRatio="none"
      width={width}
      height={height}
      opacity={opacity}
    >
      {preset.paths.map((path) => (
        <path key={path.d} d={path.d} stroke={color} strokeWidth={path.strokeWidth} />
      ))}
    </svg>
  )
}
