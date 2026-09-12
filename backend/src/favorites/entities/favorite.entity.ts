import type { InferSelectModel } from 'drizzle-orm';
import type { favorites } from '../../database/schema/favorite.schema.js';

export type Favorite = InferSelectModel<typeof favorites>;
