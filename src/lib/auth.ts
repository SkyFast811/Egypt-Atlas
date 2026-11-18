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

function getVercelURL(value: string | undefined) {
	if (!value) {
		return undefined;
	}

	return value.startsWith("http://") || value.startsWith("https://")
		? value
		: `https://${value}`;
}

const vercelBaseURL =
	process.env.VERCEL_ENV === "production"
		? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)
		: (process.env.VERCEL_URL ??
			process.env.VERCEL_BRANCH_URL ??
			process.env.VERCEL_PROJECT_PRODUCTION_URL);
const authBaseURL =
	getVercelURL(process.env.BETTER_AUTH_URL) ??
	(process.env.VERCEL_ENV === "production"
		? "https://egypt-atlas-phi.vercel.app"
		: getVercelURL(vercelBaseURL));
const vercelTrustedOrigins = [
	process.env.VERCEL_URL,
	process.env.VERCEL_BRANCH_URL,
	process.env.VERCEL_PROJECT_PRODUCTION_URL,
]
	.map(getVercelURL)
	.filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
	baseURL: authBaseURL,
	trustedOrigins: Array.from(
		new Set(
			[
				authBaseURL,
				...vercelTrustedOrigins,
				...(process.env.NODE_ENV === "development"
					? ["http://localhost:*", "http://127.0.0.1:*"]
					: []),
			].filter((origin): origin is string => Boolean(origin)),
		),
	),
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
