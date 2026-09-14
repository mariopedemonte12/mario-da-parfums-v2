import type { Fragrance } from "@/features/fragrances/types/fragrance.types"

export type SemanticSearchResult = {
  name: string
  score: number
}

export type SemanticSearchResponse = {
  results: SemanticSearchResult[]
}

export type FragranceMatch = {
  fragrance: Fragrance
  affinity: number
}

export type SearchStatus = "idle" | "loading" | "success" | "empty" | "error"
