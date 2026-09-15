"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { cn } from "@/lib/utils";

import { useFavorites } from "../hooks/useFavorites";

type FavoriteHeartProps = {
  fragranceId: string;
  className?: string;
  size?: "sm" | "md";
};

export default function FavoriteHeart({
  fragranceId,
  className,
  size = "md",
}: FavoriteHeartProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { isFavorite, isPending, toggleFavorite } = useFavorites();

  const active = user !== null && isFavorite(fragranceId);
  const pending = isPending(fragranceId);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!user) {
      router.push("/login");
      return;
    }

    toggleFavorite(fragranceId);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={active}
      aria-label={active ? "Quitar de guardados" : "Guardar perfume"}
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-full bg-background/70 text-primary backdrop-blur-sm transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        className
      )}
    >
      <Heart
        className={size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]"}
        fill={active ? "currentColor" : "none"}
        strokeWidth={1.5}
      />
    </button>
  );
}
