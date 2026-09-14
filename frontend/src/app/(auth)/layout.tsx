import AuthPanelTransition from "@/features/auth/components/AuthPanelTransition";

// See AuthPanelTransition for the actual transition implementation and why
// it's imperative rather than AnimatePresence-driven — kept out of this
// file so app/ stays route-only (frontend/CLAUDE.md).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthPanelTransition>{children}</AuthPanelTransition>;
}
