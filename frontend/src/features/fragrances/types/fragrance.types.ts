export type Fragrance = {
  id: string;
  name: string;
  brand: string;
  concentration: string | null;
  description: string | null;
  imageUrl: string | null;
  olfactoryFamily: string | null;
  targetAudience: string | null;
  longevity: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FindFragranceParams = {
  name?: string;
  brand?: string;
  concentration?: string;
  targetAudience?: string;
  longevity?: string;
  cursor?: string;
  limit?: number;
};

// Matches backend/src/fragrances/dto/paginated-fragrance.dto.ts: keyset/cursor
// pagination, no total/page/meta — see specs/query-performance.md.
export type PaginatedFragranceResponse = {
  data: Fragrance[];
  nextCursor: string | null;
};

// Same shape as PaginatedFragranceResponse — kept as a separate alias because
// home-search's findFragranceByExactName (fragrances.api.ts) was written against
// this name; not worth a rename-and-reconcile for a plain structural duplicate.
export type PaginatedFragrances = PaginatedFragranceResponse;

// Matches backend/src/fragrances/dto/response-fragrance.dto.ts (ResponseFragranceDto).
// Kept separate from `Fragrance` above rather than reconciling it, to avoid colliding
// with fragrance-catalog's parallel work on that type — see specs/fragrance-detail.md.
export type FragranceDetail = {
  id: string;
  name: string;
  brand: string;
  concentration: string | null;
  description: string | null;
  imageUrl: string | null;
  olfactoryFamily: string | null;
  targetAudience: string | null;
  longevity: string | null;
  createdAt: string;
  updatedAt: string;
};
