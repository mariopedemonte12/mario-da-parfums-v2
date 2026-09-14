import { backendApi } from "@/lib/api/clients"
import type { Fragrance, PaginatedFragrances } from "../types/fragrance.types"

export async function getFragrances(search?: string): Promise<Fragrance[]> {
    const params = new URLSearchParams();

    if (search) {
        params.set("search", search)
    }
    return backendApi.get<Fragrance[]>(
        `/fragrances?${params.toString()}`
    )

}

// GET /fragrances?name= is a case-insensitive *contains* filter, not exact match —
// callers that need one specific fragrance by its exact name (e.g. resolving a
// semantic-search hit) must filter the page themselves. limit=50 (over the default 20)
// to reduce the odds the exact match falls outside the fetched page for a common name.
export async function findFragranceByExactName(name: string): Promise<Fragrance | null> {
    const params = new URLSearchParams({ name, limit: "50" });

    const { data } = await backendApi.get<PaginatedFragrances>(
        `/fragrances?${params.toString()}`
    )

    const normalized = name.trim().toLowerCase();

    return data.find((fragrance) => fragrance.name.trim().toLowerCase() === normalized) ?? null;
}