import { relations } from 'drizzle-orm';
import { listings } from './listing.schema.js';
import { vendors } from './vendor.schema.js';
import { fragrances } from './fragrance.schema.js';
import { favorites } from './favorite.schema.js';
import { users } from './user.schema.js';

export const vendorsListingRelations = relations(vendors, ({ many }) => ({
  listings: many(listings),
}));

export const listingsVendorsRelations = relations(listings, ({ one }) => ({
  vendors: one(vendors, {
    fields: [listings.vendorId],
    references: [vendors.id],
  }),
}));

export const fragranceListingRelations = relations(fragrances, ({ many }) => ({
  listings: many(listings),
}));

export const listingFragrancesRelations = relations(listings, ({ one }) => ({
  fragrances: one(fragrances, {
    fields: [listings.fragranceId],
    references: [fragrances.id],
  }),
}));

export const usersFavoritesRelations = relations(users, ({ many }) => ({
  favorites: many(favorites),
}));

export const favoritesUserRelations = relations(favorites, ({ one }) => ({
  users: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
}));

export const fragranceFavoritesRelations = relations(
  fragrances,
  ({ many }) => ({
    favorites: many(favorites),
  }),
);

export const favoritesFragranceRelations = relations(favorites, ({ one }) => ({
  fragrances: one(fragrances, {
    fields: [favorites.fragranceId],
    references: [fragrances.id],
  }),
}));
