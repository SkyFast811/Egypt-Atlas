import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import { authUsers, trips } from "#/db/schema";
import { auth } from "./auth";

const TripStopSchema = z.object({
	name: z.string().trim().min(1).max(160),
	coordinates: z
		.tuple([z.number().finite(), z.number().finite()])
		.refine(
			([longitude, latitude]) =>
				longitude >= -180 &&
				longitude <= 180 &&
				latitude >= -90 &&
				latitude <= 90,
			"Stop coordinates are out of range",
		),
});

const TripInputSchema = z.object({
	name: z.string().trim().min(1).max(100),
	stops: z.array(TripStopSchema).min(2).max(10),
});

async function requireUserId() {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (!session) {
		throw new Error("Sign in to access your trips.");
	}

	const [user] = await db
		.select({ emailVerified: authUsers.emailVerified })
		.from(authUsers)
		.where(eq(authUsers.id, session.user.id))
		.limit(1);
	if (!user?.emailVerified) {
		throw new Error("Verify your email before accessing your trips.");
	}

	return session.user.id;
}

export const getSavedTrips = createServerFn({ method: "GET" }).handler(
	async () => {
		const userId = await requireUserId();
		return db
			.select({
				id: trips.id,
				name: trips.name,
				stops: trips.stops,
				createdAt: trips.createdAt,
			})
			.from(trips)
			.where(eq(trips.userId, userId))
			.orderBy(desc(trips.updatedAt));
	},
);

export const saveTrip = createServerFn({ method: "POST" })
	.validator(TripInputSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const validated = TripInputSchema.parse(data);
		const [trip] = await db
			.insert(trips)
			.values({
				userId,
				name: validated.name,
				stops: validated.stops,
			})
			.returning({ id: trips.id });
		if (!trip) {
			throw new Error("The trip could not be saved.");
		}
		return trip;
	});

export const deleteTrip = createServerFn({ method: "POST" })
	.validator(z.object({ tripId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId();
		const deleted = await db
			.delete(trips)
			.where(and(eq(trips.id, data.tripId), eq(trips.userId, userId)))
			.returning({ id: trips.id });
		if (deleted.length === 0) {
			throw new Error(
				"Trip not found or you do not have permission to delete it.",
			);
		}
		return { success: true };
	});
