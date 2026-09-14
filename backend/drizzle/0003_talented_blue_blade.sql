ALTER TABLE "fragrances" DROP CONSTRAINT "fragrances_name_unique";--> statement-breakpoint
DROP INDEX "fragrances_name_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "fragrances_name_brand_idx" ON "fragrances" USING btree ("name","brand");