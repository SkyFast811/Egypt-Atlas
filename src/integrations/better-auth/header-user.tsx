import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "#/lib/auth-client";

export default function BetterAuthHeader() {
	const { data: session, isPending } = authClient.useSession();
	const [error, setError] = useState<string | null>(null);
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [isHydrated, setIsHydrated] = useState(false);

	useEffect(() => {
		setIsHydrated(true);
	}, []);

	if (!isHydrated || isPending) {
		return (
			<div className="h-8 w-8 bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
		);
	}

	if (session?.user) {
		return (
			<div className="flex items-center gap-2">
				{session.user.image ? (
					<img src={session.user.image} alt="" className="h-8 w-8" />
				) : (
					<div className="h-8 w-8 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
						<span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
							{session.user.name?.charAt(0).toUpperCase() || "U"}
						</span>
					</div>
				)}
				<div className="hidden text-sm sm:block">
					{session.user.name || session.user.email}
				</div>
				<button
					type="button"
					onClick={async () => {
						setError(null);
						setIsSigningOut(true);
						try {
							const result = await authClient.signOut();
							if (result.error) {
								setError(result.error.message || "Unable to log out.");
							}
						} catch {
							setError("Unable to log out. Please try again.");
						} finally {
							setIsSigningOut(false);
						}
					}}
					disabled={isSigningOut}
					className="flex-1 h-9 px-4 text-sm font-medium bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
				>
					{isSigningOut ? "Logging out..." : "Log out"}
				</button>
				{error && (
					<span role="alert" className="text-xs text-red-500">
						{error}
					</span>
				)}
			</div>
		);
	}

	return (
		<Link
			to="/auth"
			className="rounded-sm border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
		>
			Sign in
		</Link>
	);
}
