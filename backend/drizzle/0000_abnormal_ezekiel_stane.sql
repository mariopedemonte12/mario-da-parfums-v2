CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"photo_s3_key" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_name_unique" UNIQUE("name"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "fragrances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"brand" varchar(128) NOT NULL,
	"concentration" varchar(128),
	"description" text,
	"image_url" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fragrances_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"website_url" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updates_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"perfume_id" uuid NOT NULL,
	"vendor_id" integer NOT NULL,
	"size_ml" integer NOT NULL,
	"price" integer NOT NULL,
	"url" varchar(500) NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"scraped_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"fragrance_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_perfume_id_fragrances_id_fk" FOREIGN KEY ("perfume_id") REFERENCES "public"."fragrances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_fragrance_id_fragrances_id_fk" FOREIGN KEY ("fragrance_id") REFERENCES "public"."fragrances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fragrances_name_idx" ON "fragrances" USING btree ("name");--> statement-breakpoint
CREATE INDEX "fragrances_brand_idx" ON "fragrances" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "listings_fragrance_id_idx" ON "listings" USING btree ("perfume_id");--> statement-breakpoint
CREATE INDEX "listings_vendor_id_idx" ON "listings" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_vendor_fragrance_size_idx" ON "listings" USING btree ("vendor_id","perfume_id","size_ml");--> statement-breakpoint
CREATE INDEX "favorites_user_id_idx" ON "favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "favorites_fragrance_id_idx" ON "favorites" USING btree ("fragrance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_fragrance_idx" ON "favorites" USING btree ("user_id","fragrance_id");