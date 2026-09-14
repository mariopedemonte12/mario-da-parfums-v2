import type { ReactNode } from "react";

import WindLines from "@/components/ui/WindLines";

type AuthSplitPanelProps = {
  headline: ReactNode;
  subtitle: string;
  children: ReactNode;
};

// Shared layout for /login and /register — mock artboard 1h ("panel
// dividido, viento cruza el pliegue"). Login/register are separate routes
// sharing this presentational shell, not client-side tab state. AuthTabs
// renders in app/(auth)/layout.tsx, above and outside this panel — kept
// static there (not swept by the panel transition), not here — see
// specs/auth-pages.md, "Tab selector".
export default function AuthSplitPanel({ headline, subtitle, children }: AuthSplitPanelProps) {
  return (
    <div className="mx-auto w-full max-w-6xl md:my-12 md:grid md:grid-cols-2 md:overflow-hidden md:rounded-[2rem] md:border md:border-border">
      <div className="relative flex flex-col gap-8 overflow-hidden bg-primary px-8 py-12 text-primary-foreground md:min-h-[640px] md:justify-between md:gap-0 md:px-14 md:py-14">
        <WindLines
          color="var(--color-border)"
          opacity={0.45}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <span className="relative font-serif text-xl font-medium italic">mario-da-parfumsv2</span>
        <h1 className="relative font-serif text-4xl leading-[1.05] font-normal text-balance md:text-6xl">
          {headline}
        </h1>
        <p className="relative max-w-sm font-sans text-sm font-light text-border">{subtitle}</p>
      </div>

      <div className="flex flex-col gap-7 px-8 py-12 md:px-16 md:py-14">{children}</div>
    </div>
  );
}
