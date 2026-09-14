import { queryApi } from "@/lib/api/clients"
import type { SemanticSearchResponse } from "../types/search.types"

export async function searchFragrancesByDescription(
  query: string,
  topK: number
): Promise<SemanticSearchResponse> {
  const params = new URLSearchParams({ q: query, top_k: String(topK) })

  return queryApi.get<SemanticSearchResponse>(`/search?${params.toString()}`)
}
