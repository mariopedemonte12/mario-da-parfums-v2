const NAV_LINK_CLASSNAME =
  "rounded-full border border-border px-5 py-2 font-sans text-[13px] tracking-[0.14em] text-text-muted uppercase transition-colors hover:border-primary hover:text-primary";

export default function LegalPageNav() {
  return (
    <nav aria-label="Secciones de esta página" className="mt-8 flex flex-wrap gap-3">
      <a href="#terminos" className={NAV_LINK_CLASSNAME}>
        Términos y condiciones
      </a>
      <a href="#privacidad" className={NAV_LINK_CLASSNAME}>
        Política de privacidad
      </a>
    </nav>
  );
}
