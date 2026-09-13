import Link from "next/link";
import type { ReactNode } from "react";

import WindLines from "@/components/ui/WindLines";

// A gust that spawns beneath the word on hover — two short strokes drawn in from nothing
// (not WindLines' continuous flow) via stroke-dashoffset, and retracted the same way on
// hover-out. See the `.nav-gust` rule in globals.css for the draw transition.
function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="nav-link relative inline-block">
      {children}
      <svg
        aria-hidden="true"
        focusable="false"
        className="nav-gust pointer-events-none absolute inset-x-0 -bottom-1.5 h-2 w-full"
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
      >
        <path d="M0 6 L100 4" strokeWidth="1.4" pathLength={1} />
        <path d="M0 8 L100 7" strokeWidth="1" pathLength={1} />
      </svg>
    </Link>
  );
}

export default function Navbar() {
  return (
    <header className="relative bg-background">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-14 pt-[26px] pb-[18px] text-[13px] font-normal tracking-[0.14em] uppercase">
        <Link
          href="/"
          className="font-serif text-2xl font-medium italic tracking-normal normal-case"
        >
          mario-da-parfumsv2
        </Link>

        <div className="flex gap-10">
          <NavLink href="/">Inicio</NavLink>
          <NavLink href="/fragrances">Perfumes</NavLink>
          <span>Notas</span>
          <span>Sensei</span>
        </div>

        <div className="flex items-center gap-7">
          <NavLink href="/login">Entrar</NavLink>
          <span className="inline-block h-[26px] w-[26px] rounded-full border border-primary" />
        </div>
      </nav>

      <WindLines variant="divider" className="absolute inset-x-0 bottom-0 h-[14px] w-full" />
    </header>
  );
}
