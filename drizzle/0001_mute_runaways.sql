CREATE TYPE "public"."poi_type_enum" AS ENUM('natural', 'modern human made', 'historic human made');--> statement-breakpoint
CREATE TABLE "egypt_pois" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lng" real NOT NULL,
	"lat" real NOT NULL,
	"classification" "poi_type_enum" NOT NULL,
	CONSTRAINT "egypt_pois_lng_unique" UNIQUE("lng"),
	CONSTRAINT "egypt_pois_lat_unique" UNIQUE("lat")
);
