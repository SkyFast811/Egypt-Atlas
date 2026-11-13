CREATE TABLE "airports" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lng" real NOT NULL,
	"lat" real NOT NULL,
	CONSTRAINT "airports_lng_unique" UNIQUE("lng"),
	CONSTRAINT "airports_lat_unique" UNIQUE("lat")
);
