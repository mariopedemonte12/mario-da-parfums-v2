import type { Metadata } from "next";

import LegalPageNav from "@/features/legal/components/LegalPageNav";
import PrivacySection from "@/features/legal/components/PrivacySection";
import TermsSection from "@/features/legal/components/TermsSection";

const LAST_UPDATED = "15 de septiembre de 2026";

export const metadata: Metadata = {
  title: "Términos y privacidad · Mario da Parfums",
  description:
    "Términos y condiciones y política de privacidad de Mario da Parfums, el comparador de precios de perfumes en Chile.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10 md:px-14 md:py-14">
      <header className="mb-14">
        <p className="mb-3 font-sans text-xs tracking-[0.28em] text-text-muted uppercase">
          Legal
        </p>
        <h1 className="font-serif text-4xl text-primary italic md:text-5xl">
          Términos y privacidad
        </h1>
        <p className="mt-4 max-w-2xl font-sans text-sm leading-relaxed text-text-muted">
          Cómo funciona Mario da Parfums, qué datos usamos y cómo cuidamos tu privacidad.
          Última actualización: {LAST_UPDATED}.
        </p>

        <LegalPageNav />
      </header>

      <TermsSection />

      <div className="my-14 border-t border-border" />

      <PrivacySection lastUpdated={LAST_UPDATED} />
    </main>
  );
}
