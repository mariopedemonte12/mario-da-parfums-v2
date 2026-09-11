import { relations } from "drizzle-orm";
import { listings } from "./listing.schema.js";
import { vendors } from "./vendor.schema.js";
import { fragrances } from "./fragrance.schema.js";

export const vendorsListingRelations = relations(vendors, ({ many }) => ({
    listings: many(listings)
}))

export const listingsVendorsRelations = relations(listings, ({ one }) => ({
    vendors: one(vendors, {
    fields: [listings.vendorId],
    references: [vendors.id],
   }) 
}));

export const fragranceListingRelations = relations(fragrances, ({ many }) => ({
    listings: many(listings)
}));

export const listingFragrancesRelations = relations(listings, ({ one }) => ({
    fragrances: one(fragrances, {
    fields: [listings.fragranceId],
    references: [fragrances.id]
    })
}))

