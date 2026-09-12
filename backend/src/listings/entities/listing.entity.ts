import type { InferSelectModel } from 'drizzle-orm';
import { listings } from '../../database/schema/listing.schema.js';

export type Listing = InferSelectModel<typeof listings>;
