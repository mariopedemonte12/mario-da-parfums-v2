"use client";

import { useEffect, useRef } from "react";
import { animate } from "motion/react";
import { usePathname, useRouter } from "next/navigation";

import { authPanelSweep } from "@/lib/motion";
import { AuthPanelTransitionContext } from "../hooks/useAuthPanelTransition";
import AuthTabs from "./AuthTabs";

function withoutTransition(variant: object): [Record<string, unknown>, object | undefined] {
  const { transition, ...target } = variant as Record<string, unknown> & { transition?: object };
  return [target, transition];
}

// Rendered by app/(auth)/layout.tsx, wrapping /login and /register so
// switching between them reads as one wind gust carrying the old panel
// away and bringing the new one in, per specs/auth-pages.md — while
// keeping them as two real routes, each with its own URL/history entry (a
// route group adds no URL segment).
//
// This does NOT use AnimatePresence. Two different AnimatePresence-based
// attempts were tried first and both broke in practice: Next swaps a
// layout's `{children}` prop for a sibling-route navigation as one atomic
// replace (the layout itself never remounts), so AnimatePresence never
// actually gets a render where the old and new content are both present
// for it to diff — regardless of whether the animated element lived
// directly in the layout or one level down in a template.js (which gets a
// fresh instance per navigation). Depending on the exact setup this showed
// up either as the exiting panel flashing to the *new* route's content
// mid-exit, or the exit not playing at all.
//
// Fix: animate `panelRef`'s DOM node *imperatively* via `animate()`
// (from `motion/react`), entirely decoupled from React mount/unmount
// timing. `navigateWithExit` (exposed to AuthTabs via
// `useAuthPanelTransition`) plays the exit transition on the current DOM —
// still showing the OLD route, since nothing has navigated yet — and only
// calls `router.push` once that finishes. The effect below plays the enter
// transition once `pathname` actually changes (i.e. the new route's
// content has mounted into this same, never-unmounted `panelRef` node).
//
// AuthTabs itself renders here, outside `panelRef` — the user explicitly
// wants the tab selector to stay static, not swept along with the panel.
export default function AuthPanelTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const active = pathname === "/register" ? "register" : "login";

  useEffect(() => {
    if (!panelRef.current) return;
    const [target, transition] = withoutTransition(authPanelSweep.show);
    animate(panelRef.current, target, transition);
  }, [pathname]);

  async function navigateWithExit(href: string) {
    if (href === pathname) return;
    if (panelRef.current) {
      const [target, transition] = withoutTransition(authPanelSweep.exit);
      await animate(panelRef.current, target, transition).finished;
    }
    router.push(href);
  }

  return (
    <AuthPanelTransitionContext.Provider value={navigateWithExit}>
      <div className="px-4 pt-8 md:px-6">
        <AuthTabs active={active} />
      </div>
      <div ref={panelRef}>{children}</div>
    </AuthPanelTransitionContext.Provider>
  );
}
