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

// Matches backend/src/listings/dto/paginated-listings.dto.ts: keyset/cursor
// pagination, no total/page/meta — see specs/query-performance.md.
export type PaginatedListings = {
    data: Listing[];
    nextCursor: number | null;
}
