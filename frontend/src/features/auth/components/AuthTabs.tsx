"use client";

import { useAuthPanelTransition } from "../hooks/useAuthPanelTransition";
import WindGustLink from "@/features/common/components/WindGustLink";
import { cn } from "@/lib/utils";

type AuthTabsProps = {
  active: "login" | "register";
};

// Rendered by AuthPanelTransition, above the animated panel wrapper (kept
// static, not swept along with it — per specs/auth-pages.md, "Tab
// selector"). Reuses the navbar's wind-gust underline (WindGustLink) for
// the active tab instead of a plain border-b. `onNavigate` plays the
// panel's exit animation before actually changing route — see
// AuthPanelTransition.tsx for why this can't just be a plain `<Link>`.
export default function AuthTabs({ active }: AuthTabsProps) {
  const navigateWithExit = useAuthPanelTransition();

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 pb-6 font-sans text-[13px] tracking-[0.14em] uppercase">
      <WindGustLink
        href="/login"
        onNavigate={navigateWithExit}
        isActive={active === "login"}
        className={cn("pb-1.5 transition-colors", active === "login" ? "text-primary" : "text-secondary")}
      >
        Entrar
      </WindGustLink>
      <WindGustLink
        href="/register"
        onNavigate={navigateWithExit}
        isActive={active === "register"}
        className={cn("pb-1.5 transition-colors", active === "register" ? "text-primary" : "text-secondary")}
      >
        Crear cuenta
      </WindGustLink>
    </div>
  );
}
