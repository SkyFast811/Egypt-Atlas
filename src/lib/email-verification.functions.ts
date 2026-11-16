import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, gt, sql } from "drizzle-orm";
import { createTransport } from "nodemailer";
import { z } from "zod";
import { db } from "#/db";
import { authUsers, emailVerificationTokens } from "#/db/schema";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_VERIFICATION_SCHEMA = z.object({
	email: z.string().trim().email().max(254),
});
const VERIFY_TOKEN_SCHEMA = z.object({
	token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

function getVerificationConfiguration() {
	const appUrlValue = process.env.APP_URL;
	const smtpHost = process.env.SMTP_HOST;
	const smtpPortValue = process.env.SMTP_PORT;
	const smtpUser = process.env.SMTP_USER;
	const smtpPassword = process.env.SMTP_PASSWORD;
	const smtpFrom = process.env.SMTP_FROM;

	if (!appUrlValue || !smtpHost || !smtpPortValue || !smtpFrom) {
		throw new Error(
			"APP_URL, SMTP_HOST, SMTP_PORT, and SMTP_FROM must be configured to send verification emails.",
		);
	}
	if (Boolean(smtpUser) !== Boolean(smtpPassword)) {
		throw new Error("SMTP_USER and SMTP_PASSWORD must be set together.");
	}

	const smtpPort = Number(smtpPortValue);
	if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
		throw new Error("SMTP_PORT must be a valid TCP port.");
	}

	let appUrl: URL;
	try {
		appUrl = new URL(appUrlValue);
	} catch {
		throw new Error("APP_URL must be a valid absolute URL.");
	}
	if (
		!["http:", "https:"].includes(appUrl.protocol) ||
		(process.env.NODE_ENV === "production" && appUrl.protocol !== "https:")
	) {
		throw new Error("APP_URL must use HTTPS in production.");
	}

	return {
		appUrl,
		smtpFrom,
		transporter: createTransport({
			host: smtpHost,
			port: smtpPort,
			secure: smtpPort === 465,
			auth:
				smtpUser && smtpPassword
					? { user: smtpUser, pass: smtpPassword }
					: undefined,
			connectionTimeout: 10_000,
			greetingTimeout: 10_000,
			socketTimeout: 20_000,
		}),
	};
}

function hashToken(token: string) {
	return createHash("sha256").update(token).digest("hex");
}

export const requestEmailVerification = createServerFn({ method: "POST" })
	.validator(REQUEST_VERIFICATION_SCHEMA)
	.handler(async ({ data }) => {
		const { appUrl, smtpFrom, transporter } = getVerificationConfiguration();
		const email = data.email.trim().toLowerCase();
		const [user] = await db
			.select({
				id: authUsers.id,
				email: authUsers.email,
				emailVerified: authUsers.emailVerified,
			})
			.from(authUsers)
			.where(sql`lower(${authUsers.email}) = ${email}`)
			.limit(1);

		if (!user || user.emailVerified) {
			return { success: true };
		}

		const [recentToken] = await db
			.select({ id: emailVerificationTokens.id })
			.from(emailVerificationTokens)
			.where(
				and(
					eq(emailVerificationTokens.userId, user.id),
					gt(
						emailVerificationTokens.createdAt,
						new Date(Date.now() - 60 * 1000),
					),
				),
			)
			.limit(1);
		if (recentToken) {
			return { success: true };
		}

		const token = randomBytes(32).toString("base64url");
		const tokenHash = hashToken(token);
		const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

		await db.transaction(async (transaction) => {
			await transaction
				.delete(emailVerificationTokens)
				.where(eq(emailVerificationTokens.userId, user.id));
			await transaction.insert(emailVerificationTokens).values({
				id: randomBytes(16).toString("hex"),
				userId: user.id,
				tokenHash,
				expiresAt,
			});
		});

		const verificationUrl = new URL("/verify-email", appUrl);
		verificationUrl.searchParams.set("token", token);
		const link = verificationUrl.toString();
		await transporter.sendMail({
			from: smtpFrom,
			to: user.email,
			subject: "Verify your Egypt Atlas email",
			text: `Verify your email address by opening this link within 24 hours:\n\n${link}\n\nIf you did not create an Egypt Atlas account, you can ignore this email.`,
			html: `<p>Verify your email address by opening this link within 24 hours:</p><p><a href="${link}">Verify email</a></p><p>If you did not create an Egypt Atlas account, you can ignore this email.</p>`,
		});

		return { success: true };
	});

export const verifyEmail = createServerFn({ method: "POST" })
	.validator(VERIFY_TOKEN_SCHEMA)
	.handler(async ({ data }) => {
		const tokenHash = hashToken(data.token);

		return db.transaction(async (transaction) => {
			const [token] = await transaction
				.delete(emailVerificationTokens)
				.where(
					and(
						eq(emailVerificationTokens.tokenHash, tokenHash),
						gt(emailVerificationTokens.expiresAt, new Date()),
					),
				)
				.returning({ userId: emailVerificationTokens.userId });

			if (!token) {
				await transaction
					.delete(emailVerificationTokens)
					.where(eq(emailVerificationTokens.tokenHash, tokenHash));
				return { verified: false };
			}

			const [user] = await transaction
				.update(authUsers)
				.set({ emailVerified: true, updatedAt: new Date() })
				.where(eq(authUsers.id, token.userId))
				.returning({ id: authUsers.id });

			return { verified: Boolean(user) };
		});
	});
