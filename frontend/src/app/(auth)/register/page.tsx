import type { Metadata } from "next";

import AuthSplitPanel from "@/features/auth/components/AuthSplitPanel";
import RegisterForm from "@/features/auth/components/RegisterForm";

export const metadata: Metadata = {
  title: "Crear cuenta — Mario da Parfums",
};

export default function RegisterPage() {
  return (
    <div className="px-4 py-8 md:px-6">
      <AuthSplitPanel
        headline={
          <>
            Deja que
            <br />
            el <em className="font-normal text-border">viento</em> te encuentre.
          </>
        }
        subtitle="Creá tu cuenta para guardar los perfumes que te acompañan y empezar a conversar con el sensei."
      >
        <RegisterForm />
      </AuthSplitPanel>
    </div>
  );
}
