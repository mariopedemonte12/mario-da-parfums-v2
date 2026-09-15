import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

type WindGustCommonProps = {
  children: ReactNode;
  className?: string;
  /** Keeps the gust drawn in permanently (e.g. the current tab/page), instead of only on hover. */
  isActive?: boolean;
  /** For non-text content (e.g. an avatar) where the visible children don't already describe the link. */
  ariaLabel?: string;
};

type WindGustLinkProps = WindGustCommonProps & {
  href: string;
  onClick?: never;
  /**
   * Intercepts a plain left-click (no modifier keys) to call this instead
   * of letting `Link` navigate immediately — e.g. AuthTabs plays an exit
   * animation first, then navigates itself. Middle-click/ctrl/cmd/shift-click
   * (open in new tab, etc.) still fall through to normal `Link` navigation.
   */
  onNavigate?: (href: string) => void;
  ariaExpanded?: never;
};
type WindGustButtonProps = WindGustCommonProps & {
  href?: never;
  onClick: () => void;
  onNavigate?: never;
  /** For a toggle button (e.g. Navbar's "Sensei" opening the chatbot panel). */
  ariaExpanded?: boolean;
};
// Neither href nor onClick: a static label (e.g. a nav item with no destination yet) that still
// gets the hover-only gust underline — `.nav-link:hover` in globals.css doesn't care what element it's on.
type WindGustStaticProps = WindGustCommonProps & {
  href?: never;
  onClick?: never;
  onNavigate?: never;
  ariaExpanded?: never;
};

// Shared "wind gust" underline: a gust that spawns beneath the link/button
// on hover — two short strokes drawn in from nothing via stroke-dashoffset,
// retracted the same way on hover-out (see the `.nav-gust` rule in
// globals.css for the draw transition). Originally Navbar-only
// (`features/layout/components/Navbar.tsx`'s `NavLink`); extracted here once
// `features/auth`'s `AuthTabs` needed the same motif (frontend/CLAUDE.md,
// "Wind motif" — shared UI belongs in `features/common`, not duplicated per
// feature). `isActive` adds a persistent (not just hover) variant via the
// `.nav-link.is-active .nav-gust path` rule in globals.css. Pass `href` for
// navigation (optionally with `onNavigate`) or `onClick` for an action
// (e.g. Navbar's "Salir") — never both.
export default function WindGustLink({
  children,
  className,
  isActive,
  ariaLabel,
  href,
  onClick,
  onNavigate,
  ariaExpanded,
}: WindGustLinkProps | WindGustButtonProps | WindGustStaticProps) {
  const sharedClassName = cn("nav-link relative inline-block", isActive && "is-active", className);

  if (href) {
    function handleClick(event: MouseEvent<HTMLAnchorElement>) {
      if (!onNavigate) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onNavigate(href);
    }

    return (
      <Link href={href} onClick={handleClick} aria-label={ariaLabel} className={sharedClassName}>
        {children}
        <Gust />
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-expanded={ariaExpanded}
        className={sharedClassName}
      >
        {children}
        <Gust />
      </button>
    );
  }

  return (
    <span aria-label={ariaLabel} className={sharedClassName}>
      {children}
      <Gust />
    </span>
  );
}

function Gust() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="nav-gust pointer-events-none absolute inset-x-0 -bottom-1.5 h-2 w-full"
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
    >
      <path d="M0 6 L100 4" strokeWidth="1.4" pathLength={1} />
      <path d="M0 8 L100 7" strokeWidth="1" pathLength={1} />
    </svg>
  );
}
