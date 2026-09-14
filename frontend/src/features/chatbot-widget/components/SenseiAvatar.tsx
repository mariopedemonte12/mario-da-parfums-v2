import { cn } from "@/lib/utils";

type SenseiAvatarProps = {
  className?: string;
};

// Small header glyph from the mock (artboard 1d, first card's header icon) — breathes
// idle in a continuous loop, independent of connection/turn state.
export default function SenseiAvatar({ className }: SenseiAvatarProps) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary",
        className
      )}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        className="sensei-breathe"
        width="24"
        height="27"
        viewBox="0 0 34 38"
      >
        <circle cx="17" cy="10" r="7" fill="var(--color-background)" />
        <path
          d="M6 36 C8 24,12 20,17 20 S26 24,28 36"
          fill="none"
          stroke="var(--color-background)"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
