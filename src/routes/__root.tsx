import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Compass, MapPinned } from "lucide-react";
import BetterAuthHeader from "../integrations/better-auth/header-user";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{ title: "Egypt Atlas" },
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className=" dark min-h-full min-w-full">
			<head>
				<HeadContent />
			</head>
			<body className="dark:bg-neutral-900 min-h-full min-w-full dark:text-white">
				<div className="mx-auto max-w-screen-2xl px-3 pb-8 pt-3 sm:px-5">
					<header className="mb-5 flex items-center justify-between border-b border-white/10 pb-3">
						<Link to="/" className="flex items-center gap-2 font-semibold">
							<MapPinned className="size-5 text-amber-400" />
							<span>Egypt Atlas</span>
						</Link>
						<div className="flex items-center gap-2">
							<nav
								aria-label="Main navigation"
								className="flex items-center gap-1"
							>
								<Link
									to="/"
									activeOptions={{ exact: true }}
									activeProps={{ className: "bg-white/10 text-white" }}
									className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white"
								>
									<MapPinned className="size-4" /> Map
								</Link>
								<Link
									to="/places"
									activeOptions={{ exact: false }}
									activeProps={{ className: "bg-white/10 text-white" }}
									className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white"
								>
									<Compass className="size-4" /> Places
								</Link>
							</nav>
							<BetterAuthHeader />
						</div>
					</header>
					<main>{children}</main>
				</div>

				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
