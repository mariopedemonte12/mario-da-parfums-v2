import type { InferSelectModel } from 'drizzle-orm';
import { vendors } from '../../database/schema/vendor.schema.js';

export type Vendor = InferSelectModel<typeof vendors>;
