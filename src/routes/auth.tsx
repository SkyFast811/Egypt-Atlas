import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";
import { requestEmailVerification } from "#/lib/email-verification.functions";

export const Route = createFileRoute("/auth")({
	component: AuthPage,
});

function AuthPage() {
	const navigate = useNavigate();
	const { data: session, isPending } = authClient.useSession();
	const [mode, setMode] = useState<"signIn" | "signUp" | "resend">("signIn");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [verificationLink, setVerificationLink] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		setNotice(null);
		setVerificationLink(null);
		setIsSubmitting(true);
		try {
			if (mode === "resend") {
				const result = await requestEmailVerification({ data: { email } });
				setNotice(
					result.verificationUrl
						? "Open the local verification link below."
						: "If the address has an unverified account, a verification link will be sent.",
				);
				setVerificationLink(result.verificationUrl ?? null);
				return;
			}

			const result =
				mode === "signIn"
					? await authClient.signIn.email({ email, password })
					: await authClient.signUp.email({ name, email, password });

			if (result.error) {
				setError(
					result.error.message ||
						"Authentication failed. Check your details and try again.",
				);
				return;
			}

			if (mode === "signUp") {
				const verification = await requestEmailVerification({
					data: { email },
				});
				setNotice(
					verification.verificationUrl
						? "Account created. Open the local verification link below."
						: "Account created. Check your email for a verification link before signing in.",
				);
				setVerificationLink(verification.verificationUrl ?? null);
				return;
			}

			await navigate({ to: "/" });
		} catch (submitError) {
			setError(
				submitError instanceof Error
					? submitError.message
					: "Unable to authenticate. Please try again.",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	if (isPending) {
		return (
			<p className="text-muted-foreground p-6 text-center">
				Checking sign-in...
			</p>
		);
	}

	if (session?.user) {
		return (
			<Card className="mx-auto mt-10 max-w-md">
				<CardHeader>
					<CardTitle>You’re signed in</CardTitle>
					<CardDescription>
						Your trips and location tracking are ready to use.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button asChild>
						<Link to="/">Go to the map</Link>
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="mx-auto mt-10 max-w-md">
			<CardHeader>
				<CardTitle>
					{mode === "signIn"
						? "Welcome back"
						: mode === "signUp"
							? "Create your account"
							: "Resend verification link"}
				</CardTitle>
				<CardDescription>
					{mode === "resend"
						? "Enter your email and we’ll send a new verification link if needed."
						: "Sign in to plan, save, and track your trips."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-4" onSubmit={handleSubmit}>
					{mode === "signUp" && (
						<label
							htmlFor="auth-name"
							className="block space-y-1.5 text-sm font-medium"
						>
							Name
							<Input
								id="auth-name"
								autoComplete="name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								required
								maxLength={100}
							/>
						</label>
					)}
					<label
						htmlFor="auth-email"
						className="block space-y-1.5 text-sm font-medium"
					>
						Email
						<Input
							id="auth-email"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							required
						/>
					</label>
					{mode !== "resend" && (
						<label
							htmlFor="auth-password"
							className="block space-y-1.5 text-sm font-medium"
						>
							Password
							<Input
								id="auth-password"
								type="password"
								autoComplete={
									mode === "signIn" ? "current-password" : "new-password"
								}
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								required
								minLength={8}
							/>
						</label>
					)}
					{error && (
						<p role="alert" className="text-destructive text-sm">
							{error}
						</p>
					)}
					{notice && (
						<output className="text-sm text-emerald-500">{notice}</output>
					)}
					{verificationLink && (
						<p className="text-sm">
							<a
								className="text-foreground underline underline-offset-4"
								href={verificationLink}
							>
								Verify your email
							</a>
						</p>
					)}
					<Button className="w-full" type="submit" disabled={isSubmitting}>
						{isSubmitting
							? "Please wait..."
							: mode === "signIn"
								? "Sign in"
								: mode === "signUp"
									? "Create account"
									: "Send verification link"}
					</Button>
					<p className="text-muted-foreground text-center text-sm">
						{mode === "signUp"
							? "Already have an account?"
							: mode === "resend"
								? "Want to sign in?"
								: "New to Egypt Atlas?"}{" "}
						<button
							type="button"
							className="text-foreground underline underline-offset-4"
							onClick={() => {
								setError(null);
								setNotice(null);
								setMode(mode === "signUp" ? "signIn" : "signUp");
							}}
						>
							{mode === "signUp" ? "Sign in" : "Create an account"}
						</button>
					</p>
					{mode === "signIn" && (
						<p className="text-center text-sm">
							<button
								type="button"
								className="text-foreground underline underline-offset-4"
								onClick={() => {
									setError(null);
									setNotice(null);
									setMode("resend");
								}}
							>
								Resend verification link
							</button>
						</p>
					)}
				</form>
			</CardContent>
		</Card>
	);
}
