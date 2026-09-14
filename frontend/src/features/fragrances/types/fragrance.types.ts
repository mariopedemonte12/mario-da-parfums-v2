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
}

export type PaginatedFragrances = {
    data: Fragrance[];
    total: number;
    page: number;
    limit: number;
}
