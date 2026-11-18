import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema.ts";

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!databaseUrl) {
	throw new Error(
		"DATABASE_URL or POSTGRES_URL must be set before initializing the database",
	);
}

export const db = drizzle(databaseUrl, { schema });
