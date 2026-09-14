import { backendApi } from "@/lib/api/clients";

import type { PaginatedFavorites, UserProfile } from "../types/profile.types";

export async function getUser(id: number): Promise<UserProfile> {
  return backendApi.get<UserProfile>(`/users/${id}`);
}

export async function getFavorites(
  page: number,
  limit: number
): Promise<PaginatedFavorites> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  return backendApi.get<PaginatedFavorites>(`/favorites?${params.toString()}`);
}
