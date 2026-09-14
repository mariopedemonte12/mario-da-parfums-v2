// Matches backend/src/listings/dto/response-listing.dto.ts (ResponseListingDto).
export type Listing = {
    id: number;
    fragranceId: string;
    vendorId: number;
    sizeMl: number;
    price: number;
    url: string;
    inStock: boolean;
    scrapedAt: string;
}

export type PaginationMeta = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

// Matches backend/src/listings/dto/paginated-listings.dto.ts (PaginatedListingsDto).
export type PaginatedListings = {
    data: Listing[];
    meta: PaginationMeta;
}
