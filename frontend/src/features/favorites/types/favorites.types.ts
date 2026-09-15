// Matches backend/src/favorites/dto/paginated-favorite.dto.ts — only the
// fields this feature actually reads (the favorited fragrance's id) are
// kept, the rest of ResponseFragranceDto is irrelevant here.
export type FavoritesListResponse = {
  data: { fragrance: { id: string } }[];
  total: number;
  page: number;
  limit: number;
};
