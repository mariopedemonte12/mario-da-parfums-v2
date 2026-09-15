import { backendApi } from "@/lib/api/clients";

import type { FavoritesListResponse } from "../types/favorites.types";

// Backend caps `limit` at 100 (FindFavoritesDto) — the highest single page
// that can seed the app-wide favorited-id set without pagination. See
// specs/favorite-hearts.md, "Explicitly out of scope".
const MAX_LIMIT = 100;

export async function listFavoriteIds(): Promise<string[]> {
  const { data } = await backendApi.get<FavoritesListResponse>(
    `/favorites?page=1&limit=${MAX_LIMIT}`
  );

  return data.map((favorite) => favorite.fragrance.id);
}

export async function addFavorite(fragranceId: string): Promise<void> {
  await backendApi.post("/favorites/batch", { fragranceIds: [fragranceId] });
}

export async function removeFavorite(fragranceId: string): Promise<void> {
  await backendApi.delete("/favorites/batch", { fragranceIds: [fragranceId] });
}
