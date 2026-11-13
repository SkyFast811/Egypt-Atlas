import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Image as ImageIcon, Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import type { PlaceMediaImage } from "#/lib/place-media";
import { matchesPlaceName } from "#/lib/place-name-variations";
import { ArabicPlaceName } from "#/lib/place-names";
import { getEgyptPois } from "./-index.functions";

function PlaceImagePreview({
	name,
	storedImage,
}: {
	name: string;
	storedImage?: PlaceMediaImage;
}) {
	const [imageError, setImageError] = useState(false);
	const src = imageError ? undefined : storedImage?.url;
	const alt = storedImage?.alt || name;
	const credit = storedImage?.credit;
	const source = storedImage?.source;

	return (
		<div className="relative flex h-44 items-center justify-center bg-white/[0.04] text-muted-foreground">
			{src ? (
				<>
					<img
						className="h-full w-full object-cover"
						src={src}
						alt={alt}
						loading="lazy"
						onError={() => setImageError(true)}
					/>
					{(credit || source) && (
						<div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/65 px-2 py-1 text-[10px] text-white">
							<span className="truncate">{credit || "Wikimedia Commons"}</span>
							{source && (
								<a
									href={source}
									target="_blank"
									rel="noreferrer"
									className="shrink-0 underline underline-offset-2"
									onClick={(event) => event.stopPropagation()}
								>
									Photo source
								</a>
							)}
						</div>
					)}
				</>
			) : (
				<div className="flex flex-col items-center gap-2 text-xs">
					<ImageIcon className="size-8" />
					<span>No stored photo available yet</span>
				</div>
			)}
		</div>
	);
}

export const Route = createFileRoute("/places/")({
	loader: () => getEgyptPois(),
	component: PlacesComponent,
});

function PlacesComponent() {
	const poiGroups = Route.useLoaderData();
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState("all");
	const allPois = [
		...new Map(
			Object.values(poiGroups)
				.flat()
				.map((poi) => [poi.id, poi]),
		).values(),
	];
	const categories = [...new Set(allPois.map((poi) => poi.category))].sort();
	const pois = allPois
		.filter((poi) => {
			const normalizedQuery = query.trim().toLocaleLowerCase();
			const matchesQuery =
				matchesPlaceName(poi.name, normalizedQuery, poi.alternateNames) ||
				`${poi.description} ${poi.wikipediaSummary} ${poi.historyNotes}`
					.toLocaleLowerCase()
					.includes(normalizedQuery);
			return matchesQuery && (category === "all" || poi.category === category);
		})
		.sort((first, second) => first.name.localeCompare(second.name));

	return (
		<div className="mx-auto max-w-6xl">
			<div className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="mb-2 text-xs font-semibold uppercase text-amber-400">
						Field guide / Egypt
					</p>
					<h1 className="text-3xl font-semibold tracking-normal">
						Places to explore
					</h1>
					<p className="mt-2 max-w-xl text-sm text-muted-foreground">
						Browse landmarks and natural sites, with their history and visitor
						notes in one place.
					</p>
				</div>
				<p className="text-sm text-muted-foreground">{pois.length} places</p>
			</div>

			<div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search places"
						aria-label="Search places"
						className="pl-10"
					/>
				</div>
				<select
					value={category}
					onChange={(event) => setCategory(event.target.value)}
					aria-label="Filter by category"
					className="h-10 rounded-sm border border-input bg-background px-3 text-sm"
				>
					<option value="all">All categories</option>
					{categories.map((item) => (
						<option key={item} value={item}>
							{item}
						</option>
					))}
				</select>
			</div>

			{pois.length ? (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{pois.map((poi) => (
						<Card
							key={poi.id}
							className="overflow-hidden rounded-sm border-white/10 bg-white/[0.03] shadow-none transition-colors hover:border-amber-400/50"
						>
							<PlaceImagePreview name={poi.name} storedImage={poi.images[0]} />
							<CardHeader className="gap-3">
								<Badge variant="secondary" className="w-fit capitalize">
									{poi.category}
								</Badge>
								<CardTitle className="text-lg">
									<ArabicPlaceName
										name={poi.name}
										arabicName={poi.arabicName}
									/>
								</CardTitle>
								<CardDescription className="line-clamp-3 min-h-15">
									{poi.wikipediaSummary.trim() ||
										poi.description.trim() ||
										"No description is available for this place yet."}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Link
									to="/places/$placeId"
									params={{ placeId: String(poi.id) }}
									className="inline-flex items-center gap-2 text-sm font-medium text-amber-400 hover:text-amber-300"
								>
									Read place notes <ArrowRight className="size-4" />
								</Link>
							</CardContent>
						</Card>
					))}
				</div>
			) : (
				<p className="border border-dashed border-white/15 p-8 text-center text-sm text-muted-foreground">
					No places match these filters.
				</p>
			)}
		</div>
	);
}
