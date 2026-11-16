import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { verifyEmail } from "#/lib/email-verification.functions";

export const Route = createFileRoute("/verify-email")({
	validateSearch: (search: Record<string, unknown>) => ({
		token: typeof search.token === "string" ? search.token : undefined,
	}),
	component: VerifyEmailPage,
});

function VerifyEmailPage() {
	const { token } = Route.useSearch();
	const [status, setStatus] = useState<
		"idle" | "verifying" | "verified" | "invalid" | "error"
	>("idle");
	const [error, setError] = useState<string | null>(null);

	const handleVerify = async () => {
		if (!token) {
			setStatus("invalid");
			return;
		}

		setStatus("verifying");
		setError(null);
		try {
			const result = await verifyEmail({ data: { token } });
			setStatus(result.verified ? "verified" : "invalid");
		} catch (verificationError) {
			setError(
				verificationError instanceof Error
					? verificationError.message
					: "Unable to verify your email. Please try again.",
			);
			setStatus("error");
		}
	};

	return (
		<Card className="mx-auto mt-10 max-w-md">
			<CardHeader>
				<CardTitle>
					{status === "verified" ? "Email verified" : "Verify your email"}
				</CardTitle>
				<CardDescription>
					{status === "verified"
						? "Your email address is confirmed. You can now sign in."
						: status === "invalid"
							? "This verification link is invalid or has expired."
							: "Confirm the email address on your Egypt Atlas account."}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{status === "error" && error && (
					<p role="alert" className="text-destructive text-sm">
						{error}
					</p>
				)}
				{status === "verifying" && (
					<p className="text-muted-foreground text-sm">Verifying your email…</p>
				)}
				{status === "verified" ? (
					<Button asChild>
						<Link to="/auth">Sign in</Link>
					</Button>
				) : status === "invalid" ? (
					<Button asChild>
						<Link to="/auth">Request a new verification link</Link>
					</Button>
				) : (
					<Button
						type="button"
						onClick={handleVerify}
						disabled={status === "verifying"}
					>
						Verify email
					</Button>
				)}
			</CardContent>
		</Card>
	);
}
