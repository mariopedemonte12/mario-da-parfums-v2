ALTER TABLE "fragrances" ADD COLUMN "olfactory_family" varchar(128);--> statement-breakpoint
ALTER TABLE "fragrances" ADD COLUMN "target_audience" varchar(32);--> statement-breakpoint
ALTER TABLE "fragrances" ADD COLUMN "longevity" varchar(32);--> statement-breakpoint
CREATE INDEX "fragrances_olfactory_family_idx" ON "fragrances" USING btree ("olfactory_family");--> statement-breakpoint
CREATE INDEX "fragrances_longevity_idx" ON "fragrances" USING btree ("longevity");