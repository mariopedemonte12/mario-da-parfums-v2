"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import FavoritesGrid from "@/features/profile/components/FavoritesGrid";
import ProfileHeader from "@/features/profile/components/ProfileHeader";
import { useProfile } from "@/features/profile/hooks/useProfile";

export default function ProfilePage() {
  const router = useRouter();
  const { profile, favorites, favoritesTotal, loading, error, sessionExpired } =
    useProfile();

  useEffect(() => {
    if (sessionExpired) {
      router.replace("/login");
    }
  }, [sessionExpired, router]);

  if (loading || sessionExpired) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <p className="text-center text-text-muted">Cargando tu perfil...</p>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <p className="rounded-lg border border-border bg-surface p-4 text-center text-text">
          {error ?? "No se pudo cargar tu perfil."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10 md:px-14 md:py-11">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[300px_1fr] md:gap-14">
        <ProfileHeader profile={profile} />
        <FavoritesGrid favorites={favorites} total={favoritesTotal} />
      </div>
    </main>
  );
}
