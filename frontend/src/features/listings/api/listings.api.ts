import { backendApi } from "@/lib/api/clients";
import type { PaginatedListings } from "../types/listing.types";

export type FindListingsParams = {
    fragranceId?: string;
    vendorId?: number;
    inStock?: boolean;
    minPrice?: number;
    maxPrice?: number;
    page?: number;
    limit?: number;
};

export async function getListings(
    params: FindListingsParams = {}
): Promise<PaginatedListings> {
    const query = new URLSearchParams();

    if (params.fragranceId) query.set("fragranceId", params.fragranceId);
    if (params.vendorId !== undefined) query.set("vendorId", String(params.vendorId));
    if (params.inStock !== undefined) query.set("inStock", String(params.inStock));
    if (params.minPrice !== undefined) query.set("minPrice", String(params.minPrice));
    if (params.maxPrice !== undefined) query.set("maxPrice", String(params.maxPrice));
    query.set("page", String(params.page ?? 1));
    query.set("limit", String(params.limit ?? 20));

    return backendApi.get<PaginatedListings>(`/listings?${query.toString()}`);
}
