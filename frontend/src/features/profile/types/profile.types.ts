export type UserProfile = {
  id: number;
  name: string;
  email: string;
  role: string;
  photoS3Key: string | null;
  createdAt: string;
};

export type FavoriteFragrance = {
  id: string;
  name: string;
  brand: string;
  olfactoryFamily: string | null;
  imageUrl: string | null;
};

export type Favorite = {
  id: number;
  fragrance: FavoriteFragrance;
  createdAt: string;
};

export type PaginatedFavorites = {
  data: Favorite[];
  total: number;
  page: number;
  limit: number;
};
