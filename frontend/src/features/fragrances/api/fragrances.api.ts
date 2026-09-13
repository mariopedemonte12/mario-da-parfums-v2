import { backendApi } from "@/lib/api/clients"
import type { Fragrance } from "../types/fragrance.types"

export async function getFragrances(search?: string): Promise<Fragrance[]> {
    const params = new URLSearchParams();

    if (search) {
        params.set("search", search)
    }
    return backendApi.get<Fragrance[]>(
        `/fragrances?${params.toString()}`
    )
    
}