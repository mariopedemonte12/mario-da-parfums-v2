import type { Metadata } from "next";

import AuthSplitPanel from "@/features/auth/components/AuthSplitPanel";
import LoginForm from "@/features/auth/components/LoginForm";

export const metadata: Metadata = {
  title: "Entrar — Mario da Parfums",
};

export default function LoginPage() {
  return (
    <div className="px-4 py-8 md:px-6">
      <AuthSplitPanel
        headline={
          <>
            Vuelve a
            <br />
            tu <em className="font-normal text-border">estela.</em>
          </>
        }
        subtitle="Tus búsquedas, tus guardados y las conversaciones con el sensei te esperan donde las dejaste."
      >
        <LoginForm />
      </AuthSplitPanel>
    </div>
  );
}
