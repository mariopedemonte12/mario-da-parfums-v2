import { backendApi } from "@/lib/api/clients";
import type {
  FindFragranceParams,
  Fragrance,
  PaginatedFragranceResponse,
  PaginatedFragrances,
} from "../types/fragrance.types";

export async function getFragrances(
  params: FindFragranceParams = {}
): Promise<PaginatedFragranceResponse> {
  const searchParams = new URLSearchParams();

  if (params.name) {
    searchParams.set("name", params.name);
  }
  if (params.brand) {
    searchParams.set("brand", params.brand);
  }
  if (params.concentration) {
    searchParams.set("concentration", params.concentration);
  }
  if (params.targetAudience) {
    searchParams.set("targetAudience", params.targetAudience);
  }
  if (params.longevity) {
    searchParams.set("longevity", params.longevity);
  }
  if (params.page) {
    searchParams.set("page", String(params.page));
  }
  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }

  return backendApi.get<PaginatedFragranceResponse>(
    `/fragrances?${searchParams.toString()}`
  );
}

// GET /fragrances?name= is a case-insensitive *contains* filter, not exact match —
// callers that need one specific fragrance by its exact name (e.g. resolving a
// semantic-search hit) must filter the page themselves. limit=50 (over the default 20)
// to reduce the odds the exact match falls outside the fetched page for a common name.
export async function findFragranceByExactName(name: string): Promise<Fragrance | null> {
  const params = new URLSearchParams({ name, limit: "50" });

  const { data } = await backendApi.get<PaginatedFragrances>(
    `/fragrances?${params.toString()}`
  );

  const normalized = name.trim().toLowerCase();

  return data.find((fragrance) => fragrance.name.trim().toLowerCase() === normalized) ?? null;
}
