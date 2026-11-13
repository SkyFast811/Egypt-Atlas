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

export const Route = createFileRoute("/auth")({
	component: AuthPage,
});

function AuthPage() {
	const navigate = useNavigate();
	const { data: session, isPending } = authClient.useSession();
	const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		setIsSubmitting(true);
		try {
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
					{mode === "signIn" ? "Welcome back" : "Create your account"}
				</CardTitle>
				<CardDescription>
					Sign in to plan, save, and track your trips.
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
					{error && (
						<p role="alert" className="text-destructive text-sm">
							{error}
						</p>
					)}
					<Button className="w-full" type="submit" disabled={isSubmitting}>
						{isSubmitting
							? "Please wait..."
							: mode === "signIn"
								? "Sign in"
								: "Create account"}
					</Button>
					<p className="text-muted-foreground text-center text-sm">
						{mode === "signIn"
							? "New to Egypt Atlas?"
							: "Already have an account?"}{" "}
						<button
							type="button"
							className="text-foreground underline underline-offset-4"
							onClick={() => {
								setError(null);
								setMode(mode === "signIn" ? "signUp" : "signIn");
							}}
						>
							{mode === "signIn" ? "Create an account" : "Sign in"}
						</button>
					</p>
				</form>
			</CardContent>
		</Card>
	);
}
