import type { InferSelectModel } from 'drizzle-orm';
import type { fragrances } from '../../database/schema/fragrance.schema.js';

export type Fragrance = InferSelectModel<typeof fragrances>;
