import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gt, gte, lte } from "drizzle-orm";
import { z } from "zod";

import { db } from "#/db";
import { egyptPois, places } from "#/db/schema";
import { PLACES_PAGE_SIZE } from "#/lib/place-types";

export const getEgyptPois = createServerFn({ method: "GET" }).handler(
	async () => {
		const northCenter = await db
			.select()
			.from(egyptPois)
			.where(
				and(
					gte(egyptPois.lat, 28.4),
					lte(egyptPois.lat, 31.6),
					gt(egyptPois.lng, 28.77),
					lte(egyptPois.lng, 32.83),
				),
			);
		const northEast = await db
			.select()
			.from(egyptPois)
			.where(
				and(
					gte(egyptPois.lat, 28.4),
					lte(egyptPois.lat, 31.6),
					gt(egyptPois.lng, 32.83),
					lte(egyptPois.lng, 36.9),
				),
			);
		const centerWest = await db
			.select()
			.from(egyptPois)
			.where(
				and(
					gt(egyptPois.lat, 25.2),
					lte(egyptPois.lat, 28.4),
					gte(egyptPois.lng, 24.7),
					lte(egyptPois.lng, 28.77),
				),
			);
		const centerCenter = await db
			.select()
			.from(egyptPois)
			.where(
				and(
					gt(egyptPois.lat, 25.2),
					lte(egyptPois.lat, 28.4),
					gt(egyptPois.lng, 28.77),
					lte(egyptPois.lng, 32.83),
				),
			);
		const centerEast = await db
			.select()
			.from(egyptPois)
			.where(
				and(
					gt(egyptPois.lat, 25.2),
					lte(egyptPois.lat, 28.4),
					gt(egyptPois.lng, 32.83),
					lte(egyptPois.lng, 36.9),
				),
			);
		const southWest = await db
			.select()
			.from(egyptPois)
			.where(
				and(
					gte(egyptPois.lat, 22.0),
					lte(egyptPois.lat, 25.2),
					gte(egyptPois.lng, 24.7),
					lte(egyptPois.lng, 28.77),
				),
			);
		const southCenter = await db
			.select()
			.from(egyptPois)
			.where(
				and(
					gte(egyptPois.lat, 22.0),
					lte(egyptPois.lat, 25.2),
					gt(egyptPois.lng, 28.77),
					lte(egyptPois.lng, 32.83),
				),
			);
		const southEast = await db
			.select()
			.from(egyptPois)
			.where(
				and(
					gte(egyptPois.lat, 22.0),
					lte(egyptPois.lat, 25.2),
					gt(egyptPois.lng, 32.83),
					lte(egyptPois.lng, 36.9),
				),
			);
		const northWest = await db
			.select()
			.from(egyptPois)
			.where(
				and(
					gte(egyptPois.lat, 28.4),
					lte(egyptPois.lat, 31.6),
					gte(egyptPois.lng, 24.7),
					lte(egyptPois.lng, 28.77),
				),
			);
		return {
			northWest,
			northCenter,
			northEast,
			centerWest,
			centerCenter,
			centerEast,
			southWest,
			southCenter,
			southEast,
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
