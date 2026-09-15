import Link from "next/link";

import WindLines from "@/components/ui/WindLines";

export default function Footer() {
  return (
    <footer className="relative flex items-end justify-between gap-4 px-6 pt-4 pb-6 text-[11px] tracking-[0.06em] text-text-muted md:px-14 md:pt-[22px] md:pb-[26px] md:text-xs">
      <WindLines variant="divider" className="absolute inset-x-0 top-0 h-[16px] w-full" />

      <span>© 2026 mario-da-parfumsv2</span>

      <span className="md:hidden">
        Envíos · Notas · Contacto ·{" "}
        <Link href="/terminos" className="underline-offset-2 hover:underline">
          Términos y privacidad
        </Link>
      </span>

      <div className="hidden gap-7 md:flex">
        <span>Envíos</span>
        <span>Notas olfativas</span>
        <span>Contacto</span>
        <span>Instagram</span>
        <Link href="/terminos" className="underline-offset-2 hover:underline">
          Términos y privacidad
        </Link>
      </div>
    </footer>
  );
}
