import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
	ArrowLeft,
	CalendarDays,
	ExternalLink,
	Image as ImageIcon,
	Lightbulb,
	MapPin,
	Sparkles,
} from "lucide-react";
import { PlaceMarkdown } from "#/components/custom/PlaceMarkdown";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { ArabicPlaceName } from "#/lib/place-names";
import { getEgyptPoiById } from "./-index.functions";

export const Route = createFileRoute("/places/$placeId")({
	loader: async ({ params }) => {
		const id = Number(params.placeId);
		if (!Number.isSafeInteger(id) || id < 1) throw notFound();
		const poi = await getEgyptPoiById({ data: { id } });
		if (!poi) throw notFound();
		return poi;
	},
	notFoundComponent: () => (
		<div className="mx-auto max-w-2xl py-16 text-center">
			<h1 className="text-2xl font-semibold">Place not found</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				This place may have been removed or its link is incorrect.
			</p>
			<Link
				to="/places"
				className="mt-5 inline-flex items-center gap-2 text-sm text-amber-400"
			>
				<ArrowLeft className="size-4" /> Browse places
			</Link>
		</div>
	),
	component: PlaceDetailComponent,
});

function PlaceDetailComponent() {
	const poi = Route.useLoaderData();
	const wikipediaSummary = poi.wikipediaSummary.trim();
	const description = poi.description.trim();
	const overview = wikipediaSummary || description;
	const historyNotes = !poi.historyNotes.startsWith(
		`For ${poi.name}, use on-site interpretation`,
	)
		? poi.historyNotes.trim()
		: "";
	const infoTips = poi.infoTips.filter(
		(tip) =>
			!tip.startsWith("Check current opening times, ticket rules") &&
			!tip.startsWith(
				"Bring water, sun protection, and comfortable footwear",
			) &&
			!tip.startsWith("Respect conservation boundaries and local customs"),
	);
	const funActivities = poi.funActivities.filter(
		(activity) =>
			!activity.startsWith("Take a slow observation walk") &&
			!activity.startsWith("Make a short photo or sketch journal") &&
			!activity.startsWith("Pair the visit with a nearby museum"),
	);

	return (
		<article className="mx-auto max-w-5xl">
			<Link
				to="/places"
				className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white"
			>
				<ArrowLeft className="size-4" /> All places
			</Link>
			<div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.8fr)]">
				<Card className="overflow-hidden rounded-sm border-white/10 bg-white/[0.03] shadow-none">
					{poi.images.length > 0 ? (
						<div className="grid gap-1">
							{poi.images.slice(0, 1).map((image) => (
								<figure key={image.url}>
									<img
										className="h-64 w-full object-cover sm:h-80"
										src={image.url}
										alt={image.alt || poi.name}
										loading="lazy"
									/>
									<figcaption className="flex items-center justify-between gap-3 px-5 pt-2 text-xs text-muted-foreground">
										<span>{image.credit ? `Image: ${image.credit}` : ""}</span>
										{image.source && (
											<a
												href={image.source}
												target="_blank"
												rel="noreferrer"
												className="inline-flex shrink-0 items-center gap-1 hover:text-foreground"
											>
												Image source <ExternalLink className="size-3" />
											</a>
										)}
									</figcaption>
								</figure>
							))}
							{poi.images.length > 1 && (
								<div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
									{poi.images.slice(1, 24).map((image) => (
										<figure key={image.url} className="min-w-0">
											<img
												className="h-32 w-full object-cover sm:h-40"
												src={image.url}
												alt={image.alt || poi.name}
												loading="lazy"
											/>
											<figcaption className="flex flex-wrap items-center justify-between gap-1 px-2 py-1 text-[10px] text-muted-foreground">
												<span className="truncate">
													{image.credit || image.alt}
												</span>
												{image.source && (
													<a
														href={image.source}
														target="_blank"
														rel="noreferrer"
														aria-label={`Image source for ${image.alt}`}
														className="inline-flex shrink-0 items-center gap-1 hover:text-foreground"
													>
														Source <ExternalLink className="size-3" />
													</a>
												)}
											</figcaption>
										</figure>
									))}
								</div>
							)}
						</div>
					) : (
						<div className="flex min-h-48 flex-col items-center justify-center gap-2 bg-white/[0.03] text-sm text-muted-foreground">
							<ImageIcon className="size-6" />
							<span>No photos are stored for this place yet.</span>
						</div>
					)}
					<CardHeader className="gap-3">
						<Badge variant="secondary" className="w-fit capitalize">
							{poi.category}
						</Badge>
						<CardTitle className="text-3xl leading-tight">
							<ArabicPlaceName name={poi.name} arabicName={poi.arabicName} />
						</CardTitle>
						<CardDescription className="text-base leading-7">
							{overview ? (
								<PlaceMarkdown className="line-clamp-3 text-base leading-7">
									{overview}
								</PlaceMarkdown>
							) : (
								"No description is stored for this place yet."
							)}
						</CardDescription>
						{poi.wikipediaUrl && (
							<a
								href={poi.wikipediaUrl}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 text-sm text-amber-400 hover:underline"
							>
								Read the Wikipedia source
								<ExternalLink className="size-3.5" />
							</a>
						)}
					</CardHeader>
				</Card>

				<div className="grid content-start gap-4">
					<Card className="rounded-sm border-white/10 bg-white/[0.03] shadow-none">
						<CardHeader className="grid-cols-[auto_1fr] items-center gap-3">
							<CalendarDays className="size-5 text-amber-400" />
							<div>
								<CardTitle className="text-base">Best time to visit</CardTitle>
								<CardDescription className="mt-1">
									{poi.bestVisitSeason}
								</CardDescription>
							</div>
						</CardHeader>
					</Card>
					<Card className="rounded-sm border-white/10 bg-white/[0.03] shadow-none">
						<CardHeader className="grid-cols-[auto_1fr] items-center gap-3">
							<MapPin className="size-5 text-amber-400" />
							<div>
								<CardTitle className="text-base">Map coordinates</CardTitle>
								<CardDescription className="mt-1">
									{poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
								</CardDescription>
							</div>
						</CardHeader>
					</Card>
				</div>
			</div>

			<div className="mt-5 grid gap-5 lg:grid-cols-2">
				<Card className="rounded-sm border-white/10 bg-white/[0.03] shadow-none">
					<CardHeader>
						<CardTitle className="text-base">
							History &amp; background
						</CardTitle>
						<CardDescription>
							Place information saved in the Egypt Atlas database.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{historyNotes || overview ? (
							<>
								<PlaceMarkdown>{historyNotes || overview}</PlaceMarkdown>
								{poi.wikipediaUrl && (
									<a
										href={poi.wikipediaUrl}
										target="_blank"
										rel="noreferrer"
										className="mt-4 inline-flex items-center gap-1 text-sm text-amber-400 hover:underline"
									>
										Read the Wikipedia source
										<ExternalLink className="size-3.5" />
									</a>
								)}
							</>
						) : (
							<p className="text-sm text-muted-foreground">
								No history or background is stored for this place yet.
							</p>
						)}
					</CardContent>
				</Card>

				<Card className="rounded-sm border-white/10 bg-white/[0.03] shadow-none">
					<CardHeader>
						<CardTitle className="text-base">
							Things to do &amp; visitor guide
						</CardTitle>
						<CardDescription>
							Visitor tips and activities saved for this place.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{infoTips.length > 0 || funActivities.length > 0 ? (
							<>
								{infoTips.length > 0 && (
									<div className="mb-5">
										<h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
											<Lightbulb className="size-4 text-amber-400" />
											Visitor tips
										</h3>
										<ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
											{infoTips.map((tip) => (
												<li key={tip}>
													<PlaceMarkdown>{tip}</PlaceMarkdown>
												</li>
											))}
										</ul>
									</div>
								)}
								{funActivities.length > 0 && (
									<div>
										<h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
											<Sparkles className="size-4 text-amber-400" />
											Things to do
										</h3>
										<ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
											{funActivities.map((activity) => (
												<li key={activity}>
													<PlaceMarkdown>{activity}</PlaceMarkdown>
												</li>
											))}
										</ul>
									</div>
								)}
							</>
						) : (
							<p className="text-sm text-muted-foreground">
								No visitor tips or activities are stored for this place yet.
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		</article>
	);
}
