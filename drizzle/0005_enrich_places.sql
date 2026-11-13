ALTER TABLE "places" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "wikipedia_url" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "images" jsonb DEFAULT '[]'::jsonb NOT NULL;