import WindLines from "@/components/ui/WindLines";

export default function Footer() {
  return (
    <footer className="relative flex items-end justify-between px-14 pt-[22px] pb-[26px] text-xs tracking-[0.06em] text-text-muted">
      <WindLines variant="divider" className="absolute inset-x-0 top-0 h-[16px] w-full" />

      <span>© 2026 mario-da-parfumsv2</span>

      <div className="flex gap-7">
        <span>Envíos</span>
        <span>Notas olfativas</span>
        <span>Contacto</span>
        <span>Instagram</span>
      </div>
    </footer>
  );
}
