import { backendApi } from "@/lib/api/clients"
import { ApiError } from "@/lib/api/client"
import type { Fragrance, FragranceDetail } from "../types/fragrance.types"

export async function getFragrances(search?: string): Promise<Fragrance[]> {
    const params = new URLSearchParams();

    if (search) {
        params.set("search", search)
    }
    return backendApi.get<Fragrance[]>(
        `/fragrances?${params.toString()}`
    )

}

export async function getFragranceById(id: string): Promise<FragranceDetail | null> {
    try {
        return await backendApi.get<FragranceDetail>(`/fragrances/${id}`)
    } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
            return null
        }
        throw error
    }
}