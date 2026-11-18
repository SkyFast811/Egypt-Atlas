import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gt, gte, lte } from "drizzle-orm";
import { z } from "zod";

import { db } from "#/db";
import { egyptPois, places } from "#/db/schema";
import { PLACES_PAGE_SIZE } from "#/lib/place-types";

export const getEgyptPois = createServerFn({ method: "GET" }).handler(
	async () => {
		const pois = await db
			.select()
			.from(egyptPois)
			.where(
				and(
					gte(egyptPois.lat, 22),
					lte(egyptPois.lat, 31.6),
					gte(egyptPois.lng, 24.7),
					lte(egyptPois.lng, 36.9),
				),
			);
		const north = (poi: (typeof pois)[number]) => poi.lat >= 28.4;
		const center = (poi: (typeof pois)[number]) =>
			poi.lat > 25.2 && poi.lat <= 28.4;
		const south = (poi: (typeof pois)[number]) => poi.lat <= 25.2;
		const west = (poi: (typeof pois)[number]) => poi.lng <= 28.77;
		const centerLng = (poi: (typeof pois)[number]) =>
			poi.lng > 28.77 && poi.lng <= 32.83;
		const east = (poi: (typeof pois)[number]) => poi.lng > 32.83;

		return {
			northWest: pois.filter((poi) => north(poi) && west(poi)),
			northCenter: pois.filter((poi) => north(poi) && centerLng(poi)),
			northEast: pois.filter((poi) => north(poi) && east(poi)),
			centerWest: pois.filter((poi) => center(poi) && west(poi)),
			centerCenter: pois.filter((poi) => center(poi) && centerLng(poi)),
			centerEast: pois.filter((poi) => center(poi) && east(poi)),
			southWest: pois.filter((poi) => south(poi) && west(poi)),
			southCenter: pois.filter((poi) => south(poi) && centerLng(poi)),
			southEast: pois.filter((poi) => south(poi) && east(poi)),
		};
	},
);

export const getPlacesPage = createServerFn({ method: "GET" })
	.validator(z.object({ afterId: z.number().int().nonnegative() }))
	.handler(async ({ data }) =>
		db
			.select({
				id: places.id,
				name: places.name,
				category: places.category,
				latitude: places.latitude,
				longitude: places.longitude,
				city: places.city,
				description: places.description,
				wikipediaUrl: places.wikipediaUrl,
				images: places.images,
			})
			.from(places)
			.where(gt(places.id, data.afterId))
			.orderBy(asc(places.id))
			.limit(PLACES_PAGE_SIZE),
	);

export const getEgyptPoiById = createServerFn({ method: "GET" })
	.validator(z.object({ id: z.number().int().positive() }))
	.handler(async ({ data }) => {
		const [poi] = await db
			.select()
			.from(egyptPois)
			.where(eq(egyptPois.id, data.id))
			.limit(1);
		return poi ?? null;
	});
