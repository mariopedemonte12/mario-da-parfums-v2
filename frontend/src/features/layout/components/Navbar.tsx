"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

import WindLines from "@/components/ui/WindLines";
import WindGustLink from "@/features/common/components/WindGustLink";
import { useAuth } from "@/features/auth/hooks/useAuth";

// Initials only, not a `photoS3Key`-backed image: there is no S3 base-URL/
// key-to-image resolution anywhere in this codebase yet (backend only
// validates the key's shape, see backend/src/users/dto/update-user.dto.ts —
// nothing serves or exposes it as a URL). Wiring an actual photo avatar
// needs that piece first; see specs/auth-pages.md, "Navbar reflects session
// state".
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

type MobileNavItem = { key: string; label: string; href?: string };

const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { key: "inicio", label: "Inicio", href: "/" },
  { key: "perfumes", label: "Perfumes", href: "/fragrances" },
  { key: "notas", label: "Notas" },
  { key: "sensei", label: "Sensei" },
  { key: "entrar", label: "Entrar", href: "/login" },
];

// Distance between pill centers while dragging/settled, in px — tuned to the pill sizes below.
const SLOT_WIDTH = 108;
// Below this drag distance a pointer-up counts as a tap (lets the Link navigate); above it,
// the gesture is treated as carousel manipulation and the click that follows is suppressed.
const DRAG_THRESHOLD = 6;

// Infinite, centered carousel for the mobile nav menu (a pedido del usuario: la lista vertical
// anterior "quedaba muy fea"). Position is index-based, not scroll-based — `activeIndex` plus a
// live fractional `dragOffset` while dragging — so wraparound is just modular arithmetic, no
// duplicated DOM items or scroll-jump trick needed for the infinite loop.
type DragState = { activeIndex: number; dragOffset: number; isDragging: boolean };

function MobileNavCarousel({ onNavigate }: { onNavigate: () => void }) {
  const [drag, setDrag] = useState<DragState>({ activeIndex: 0, dragOffset: 0, isDragging: false });
  // Plain refs for values never read during render — safe under React Compiler's rule against
  // reading ref.current while rendering. The actual position (activeIndex/dragOffset/isDragging)
  // lives in state above, always updated via the functional setDrag(prev => ...) form: a fast
  // swipe can deliver several pointer events in one React batch with no render in between, and
  // only the functional form guarantees each update chains off the previous one's real result
  // instead of a snapshot from before the batch started.
  const dragStartXRef = useRef(0);
  const draggedRef = useRef(false);

  const length = MOBILE_NAV_ITEMS.length;

  function circularOffset(index: number) {
    let diff = index - drag.activeIndex - drag.dragOffset;
    diff = ((diff % length) + length) % length;
    if (diff > length / 2) diff -= length;
    return diff;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragStartXRef.current = event.clientX;
    draggedRef.current = false;
    setDrag((prev) => ({ ...prev, isDragging: true }));
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const deltaX = event.clientX - dragStartXRef.current;
    if (Math.abs(deltaX) > DRAG_THRESHOLD) draggedRef.current = true;
    setDrag((prev) => (prev.isDragging ? { ...prev, dragOffset: -deltaX / SLOT_WIDTH } : prev));
  }

  function endDrag() {
    setDrag((prev) => {
      if (!prev.isDragging) return prev;
      const resolved =
        ((Math.round(prev.activeIndex + prev.dragOffset) % length) + length) % length;
      return { activeIndex: resolved, dragOffset: 0, isDragging: false };
    });
  }

  function handleItemClick(event: ReactMouseEvent, item: MobileNavItem) {
    if (draggedRef.current) {
      event.preventDefault();
      return;
    }
    if (item.href) onNavigate();
  }

  return (
    <div
      className="relative h-12 touch-pan-y select-none overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {MOBILE_NAV_ITEMS.map((item, index) => {
        const offset = circularOffset(index);
        const isActive = Math.round(offset) === 0;
        const distance = Math.abs(offset);
        const opacity = Math.max(0.25, 1 - distance * 0.35);
        const scale = Math.max(0.82, 1 - distance * 0.12);

        const className = `absolute top-1/2 left-1/2 shrink-0 whitespace-nowrap rounded-full border px-5 py-2 text-[13px] tracking-[0.14em] uppercase ${
          isActive ? "border-primary text-primary" : "border-border text-text-muted"
        }`;
        const style = {
          transform: `translate(-50%, -50%) translateX(${offset * SLOT_WIDTH}px) scale(${scale})`,
          opacity,
          zIndex: 10 - Math.round(distance),
          transition: drag.isDragging ? "none" : "transform 300ms ease, opacity 300ms ease",
        };

        if (item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              className={className}
              style={style}
              onClick={(event) => handleItemClick(event, item)}
            >
              {item.label}
            </Link>
          );
        }

        return (
          <span key={item.key} className={className} style={style}>
            {item.label}
          </span>
        );
      })}
    </div>
  );
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <header className="relative bg-background">
      <nav className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-6 pt-5 pb-4 text-[13px] font-normal tracking-[0.14em] uppercase md:px-14 md:pt-[26px] md:pb-[18px]">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          className="flex w-6 flex-col gap-[5px] md:hidden"
        >
          <span className="block h-px w-6 bg-primary" />
          <span className="block h-px w-4 bg-primary" />
        </button>

        <Link
          href="/"
          className="absolute left-1/2 -translate-x-1/2 font-serif text-xl font-medium italic tracking-normal normal-case md:static md:left-auto md:translate-x-0 md:text-2xl"
        >
          mario-da-parfumsv2
        </Link>

        <div className="hidden gap-10 md:flex">
          <WindGustLink href="/">Inicio</WindGustLink>
          <WindGustLink href="/fragrances">Perfumes</WindGustLink>
          <span>Notas</span>
          <span>Sensei</span>
        </div>

        {user ? (
          <WindGustLink href="/profile" ariaLabel="Tu perfil" className="md:hidden">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-primary font-sans text-[11px] normal-case">
              {getInitials(user.name)}
            </span>
          </WindGustLink>
        ) : (
          <Link href="/login" className="md:hidden" aria-label="Entrar">
            <span className="inline-block h-[26px] w-[26px] rounded-full border border-primary" />
          </Link>
        )}

        <div className="hidden items-center gap-7 md:flex">
          {user ? (
            <WindGustLink onClick={logout}>Salir</WindGustLink>
          ) : (
            <WindGustLink href="/login">Entrar</WindGustLink>
          )}
          {user ? (
            <WindGustLink href="/profile" ariaLabel="Tu perfil">
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-primary font-sans text-[11px] normal-case">
                {getInitials(user.name)}
              </span>
            </WindGustLink>
          ) : (
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-primary font-sans text-[11px] normal-case" />
          )}
        </div>
      </nav>

      {menuOpen && (
        <div className="border-t border-border py-5 md:hidden">
          <MobileNavCarousel onNavigate={() => setMenuOpen(false)} />
        </div>
      )}

      <WindLines variant="divider" className="absolute inset-x-0 bottom-0 h-[14px] w-full" />
    </header>
  );
}
