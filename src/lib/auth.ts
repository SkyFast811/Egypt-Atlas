import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "#/db";
import {
	authAccounts,
	authSessions,
	authUsers,
	authVerifications,
} from "#/db/schema";

export const auth = betterAuth({
	trustedOrigins: [
		process.env.BETTER_AUTH_URL,
		"http://localhost:3000",
		"http://127.0.0.1:3000",
	].filter((origin): origin is string => Boolean(origin)),
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: authUsers,
			session: authSessions,
			account: authAccounts,
			verification: authVerifications,
		},
	}),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [tanstackStartCookies()],
});
