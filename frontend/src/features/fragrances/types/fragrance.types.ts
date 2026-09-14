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
  page?: number;
  limit?: number;
};

// Real backend shape (backend/src/fragrances/dto/paginated-fragrance.dto.ts):
// flat { data, total, page, limit } — no `meta`, no `totalPages`.
export type PaginatedFragranceResponse = {
  data: Fragrance[];
  total: number;
  page: number;
  limit: number;
};
