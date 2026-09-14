import { backendApi } from "@/lib/api/clients";
import type {
  FindFragranceParams,
  PaginatedFragranceResponse,
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
