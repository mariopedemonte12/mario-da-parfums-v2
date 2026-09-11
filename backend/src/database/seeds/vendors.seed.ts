import type { Database } from '../database.module.js';
import { vendors, type NewVendor } from '../schema/vendor.schema.js';

// Deterministic vendor fixtures for the test database. Vendors have no FK
// dependency of their own, so this must run before the listings seed
// (listings.vendorId references vendors.id).
export const vendorSeedData: NewVendor[] = [
  {
    name: 'Fragrantica Store',
    websiteUrl: 'https://www.fragrantica-store.example.com',
  },
  {
    name: 'Perfume Direct',
    websiteUrl: 'https://www.perfume-direct.example.com',
  },
  {
    name: 'Scent Emporium',
    websiteUrl: 'https://www.scent-emporium.example.com',
  },
];

export async function seedVendors(db: Database) {
  return db
    .insert(vendors)
    .values(vendorSeedData)
    .onConflictDoNothing()
    .returning();
}
