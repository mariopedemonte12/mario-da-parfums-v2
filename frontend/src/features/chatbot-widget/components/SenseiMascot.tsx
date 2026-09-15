import { cn } from "@/lib/utils";

type SenseiMascotProps = {
  className?: string;
};

// Sumi-e ink-brush sketch from the mock (artboard 1d, second card) — an explicit
// placeholder ("boceto de dirección · ilustración final por encargo"). Swap the
// path data for the commissioned art later without touching layout/animation.
export default function SenseiMascot({ className }: SenseiMascotProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn("sensei-breathe", className)}
      width="260"
      height="330"
      viewBox="0 0 260 330"
    >
      <circle cx="150" cy="70" r="30" fill="var(--color-primary)" />
      <path
        d="M150 42 C140 30,160 22,168 34"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M90 300 C96 200,118 150,150 120 S200 190,208 300"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="44"
        strokeLinecap="round"
        opacity=".92"
      />
      <path
        d="M118 165 C90 190,70 215,60 250"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="18"
        strokeLinecap="round"
        opacity=".85"
      />
      <path
        d="M186 160 C205 175,220 190,236 198"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="16"
        strokeLinecap="round"
        opacity=".85"
      />
      <rect x="228" y="176" width="20" height="30" rx="6" fill="var(--color-secondary)" />
      <rect x="234" y="168" width="8" height="10" rx="2" fill="var(--color-secondary)" />
      <path
        d="M60 250 C70 262,90 265,110 258"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="5"
        strokeLinecap="round"
        opacity=".5"
      />
      <path
        d="M80 318 C130 306,180 306,222 318"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".35"
      />
    </svg>
  );
}
