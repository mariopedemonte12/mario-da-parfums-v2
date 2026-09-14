// Decorative only — no social-auth backend exists. Rendered for visual
// fidelity with the mock; buttons are disabled. See specs/auth-pages.md,
// "Out of scope".
export default function AuthSocialRow() {
  return (
    <>
      <div className="flex items-center gap-3.5 font-sans text-xs font-light text-text-muted">
        <span className="h-px flex-1 bg-border" />
        <span>o continúa con</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          disabled
          className="h-12 flex-1 rounded-full border border-border font-sans text-[13px] text-text-muted disabled:cursor-not-allowed"
        >
          Google
        </button>
        <button
          type="button"
          disabled
          className="h-12 flex-1 rounded-full border border-border font-sans text-[13px] text-text-muted disabled:cursor-not-allowed"
        >
          Apple
        </button>
      </div>
    </>
  );
}
