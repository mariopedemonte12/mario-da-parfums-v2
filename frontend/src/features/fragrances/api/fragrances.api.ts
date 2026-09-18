import { backendApi } from "@/lib/api/clients";
import { ApiError } from "@/lib/api/errors";
import type {
  FindFragranceParams,
  Fragrance,
  FragranceDetail,
  PaginatedFragranceResponse,
  PaginatedFragrances,
} from "../types/fragrance.types";

export async function getFragrances(
  params: FindFragranceParams = {}
): Promise<PaginatedFragranceResponse> {
  const searchParams = new URLSearchParams();

  if (params.search) {
    searchParams.set("search", params.search);
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
  if (params.cursor) {
    searchParams.set("cursor", params.cursor);
  }
  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }

  return backendApi.get<PaginatedFragranceResponse>(
    `/fragrances?${searchParams.toString()}`
  );
}

export async function getFragranceById(id: string): Promise<FragranceDetail | null> {
  try {
    return await backendApi.get<FragranceDetail>(`/fragrances/${id}`);
  } catch (error) {
    // 400 happens when `id` isn't a well-formed uuid (backend's ParseUUIDPipe rejects it
    // before ever querying) — from the user's perspective that's the same "this perfume
    // doesn't exist" outcome as a real 404, not a transient network problem worth retrying.
    if (error instanceof ApiError && (error.statusCode === 404 || error.statusCode === 400)) {
      return null;
    }
    throw error;
  }
}

// GET /fragrances?search= is a partial, case-insensitive multi-token match over name OR
// brand (max 5 tokens / 100 chars, else 400), not an exact match — callers that need one
// specific fragrance by its exact name (e.g. resolving a semantic-search hit) search with
// the (clamped) name and then compare names themselves. limit=50 (over the default 20)
// to reduce the odds the exact match falls outside the fetched page.
const MAX_SEARCH_TOKENS = 5;
const MAX_SEARCH_LENGTH = 100;

export async function findFragranceByExactName(name: string): Promise<Fragrance | null> {
  const normalized = name.trim().toLowerCase();
  const search = normalized
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TOKENS)
    .join(" ")
    .slice(0, MAX_SEARCH_LENGTH)
    .trim();
  if (!search) return null;

  const params = new URLSearchParams({ search, limit: "50" });

  const { data } = await backendApi.get<PaginatedFragrances>(
    `/fragrances?${params.toString()}`
  );

  return data.find((fragrance) => fragrance.name.trim().toLowerCase() === normalized) ?? null;
}
