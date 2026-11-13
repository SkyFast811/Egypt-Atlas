import {
	boolean,
	decimal,
	index,
	jsonb,
	pgEnum,
	pgTable,
	real,
	serial,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const authUsers = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const authSessions = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_user_id_idx").on(table.userId)],
);

export const authAccounts = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [index("account_user_id_idx").on(table.userId)],
);

export const authVerifications = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const airPorts = pgTable("airports", {
	id: serial().primaryKey(),
	name: text().notNull(),
	lng: real().notNull().unique(),
	lat: real().notNull().unique(),
});

export const poiCategoryEnum = pgEnum("poi_category_enum", [
	"natural",
	"modern human made",
	"historic human made",
]);

export const egyptPois = pgTable("egypt_pois", {
	id: serial().primaryKey(),
	name: text().notNull(),
	arabicName: text("arabic_name"),
	lng: real().notNull(),
	lat: real().notNull(),
	category: poiCategoryEnum().notNull(),
	alternateNames: jsonb("alternate_names")
		.$type<string[]>()
		.notNull()
		.default([]),
	description: text().notNull().default(""),
	wikipediaSummary: text("wikipedia_summary").notNull().default(""),
	wikipediaUrl: text("wikipedia_url"),
	images: jsonb()
		.$type<{ url: string; alt: string; source?: string; credit?: string }[]>()
		.notNull()
		.default([]),
	infoTips: jsonb("info_tips").$type<string[]>().notNull().default([]),
	historyNotes: text("history_notes").notNull().default(""),
	funActivities: jsonb("fun_activities")
		.$type<string[]>()
		.notNull()
		.default([]),
	bestVisitSeason: text("best_visit_season")
		.notNull()
		.default("October to April"),
});

export const places = pgTable("places", {
	id: serial("id").primaryKey(),
	osmId: text("osm_id").notNull().unique(),
	name: text("name"),
	category: text("category").notNull(),
	latitude: decimal("latitude", { precision: 10, scale: 7 }),
	longitude: decimal("longitude", { precision: 10, scale: 7 }),
	city: text("city"),
	phone: text("phone"),
	website: text("website"),
	description: text("description").notNull().default(""),
	wikipediaUrl: text("wikipedia_url"),
	images: jsonb()
		.$type<{ url: string; alt: string; source?: string; credit?: string }[]>()
		.notNull()
		.default([]),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TripStop = {
	name: string;
	coordinates: [number, number];
};

export const trips = pgTable(
	"trips",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		stops: jsonb("stops").$type<TripStop[]>().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [index("trips_user_id_idx").on(table.userId)],
);
