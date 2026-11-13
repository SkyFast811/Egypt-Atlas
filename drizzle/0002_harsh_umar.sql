ALTER TYPE "public"."poi_type_enum" RENAME TO "poi_category_enum";--> statement-breakpoint
ALTER TABLE "egypt_pois" RENAME COLUMN "classification" TO "category";--> statement-breakpoint
ALTER TABLE "egypt_pois" DROP CONSTRAINT IF EXISTS "egypt_pois_lng_unique";--> statement-breakpoint
ALTER TABLE "egypt_pois" DROP CONSTRAINT IF EXISTS "egypt_pois_lat_unique";--> statement-breakpoint
ALTER TABLE "egypt_pois" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "egypt_pois" ADD COLUMN "images" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "egypt_pois" ADD COLUMN "info_tips" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "egypt_pois" ADD COLUMN "history_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "egypt_pois" ADD COLUMN "fun_activities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "egypt_pois" ADD COLUMN "best_visit_season" text DEFAULT 'October to April' NOT NULL;