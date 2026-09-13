import Link from "next/link";

import WindLines from "@/components/ui/WindLines";

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
          <Link href="/">Inicio</Link>
          <Link href="/fragrances">Perfumes</Link>
          <span>Notas</span>
          <span>Sensei</span>
        </div>

        <div className="flex items-center gap-7">
          <Link href="/login">Entrar</Link>
          <span className="inline-block h-[26px] w-[26px] rounded-full border border-primary" />
        </div>
      </nav>

      <WindLines className="absolute inset-x-0 bottom-0 h-[14px] w-full" />
    </header>
  );
}
