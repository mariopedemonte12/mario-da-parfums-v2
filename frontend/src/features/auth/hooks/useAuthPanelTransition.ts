"use client";

import { createContext, useContext } from "react";

export type NavigateWithExit = (href: string) => void;

// Default is a no-op so AuthTabs (or anything else) can call this safely
// even if it's ever rendered outside AuthPanelTransition — the Provider
// (features/auth/components/AuthPanelTransition.tsx) always supplies the
// real implementation in normal use.
export const AuthPanelTransitionContext = createContext<NavigateWithExit>(() => {});

export function useAuthPanelTransition(): NavigateWithExit {
  return useContext(AuthPanelTransitionContext);
}
