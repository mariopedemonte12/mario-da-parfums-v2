// Matches backend/src/vendors/dto/response-vendor.dto.ts (ResponseVendorDto).
export type Vendor = {
    id: number;
    name: string;
    websiteUrl: string;
    createdAt: string;
    updatedAt: string;
}

export type PaginationMeta = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

// Matches backend/src/vendors/dto/paginated-vendors.dto.ts (PaginatedVendorsDto).
export type PaginatedVendors = {
    data: Vendor[];
    meta: PaginationMeta;
}
