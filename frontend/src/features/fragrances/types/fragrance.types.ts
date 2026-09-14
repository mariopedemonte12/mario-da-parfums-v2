export type Fragrance = {
    id: number;
    name: string;
    price: number;
}

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
}