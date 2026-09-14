import { backendApi } from "@/lib/api/clients";
import type { PaginatedVendors } from "../types/vendor.types";

export async function getVendors(
    page: number = 1,
    limit: number = 100
): Promise<PaginatedVendors> {
    return backendApi.get<PaginatedVendors>(
        `/vendors?page=${page}&limit=${limit}`
    );
}
