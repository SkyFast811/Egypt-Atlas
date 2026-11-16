import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { sql } from "drizzle-orm";
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
		autoSignIn: false,
	},
	hooks: {
		before: createAuthMiddleware(async (context) => {
			if (context.path !== "/sign-in/email") {
				return;
			}

			const email = context.body?.email;
			if (typeof email !== "string") {
				return;
			}

			const [user] = await db
				.select({ emailVerified: authUsers.emailVerified })
				.from(authUsers)
				.where(sql`lower(${authUsers.email}) = ${email.trim().toLowerCase()}`)
				.limit(1);

			if (user && !user.emailVerified) {
				throw new APIError("UNAUTHORIZED", {
					message: "Invalid email or password.",
				});
			}
		}),
	},
	plugins: [tanstackStartCookies()],
});
