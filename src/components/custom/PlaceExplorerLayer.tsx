import { Coffee, Hotel, MapPin, Store, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	getPlaceCategory,
	type PlaceCategory,
	placeCategories,
} from "#/lib/place-categories";
import { ArabicPlaceName } from "#/lib/place-names";
import type { Place } from "#/lib/place-types";
import {
	MapMarker,
	MarkerContent,
	MarkerPopup,
	MarkerTooltip,
	useMap,
} from "../ui/map";
import { PlaceMarkdown } from "./PlaceMarkdown";

const MINIMUM_ZOOM = 7.5;
const MAX_VISIBLE_PLACES = 120;

function getPlaceIcon(category: Exclude<PlaceCategory, "all">) {
	switch (category) {
		case "cafe":
			return <Coffee className="size-3.5 text-white" />;
		case "restaurant":
			return <UtensilsCrossed className="size-3.5 text-white" />;
		case "hotel":
			return <Hotel className="size-3.5 text-white" />;
		case "shop":
			return <Store className="size-3.5 text-white" />;
		default:
			return <MapPin className="size-3.5 text-white" />;
	}
}

function getPlaceColor(category: Exclude<PlaceCategory, "all">) {
	switch (category) {
		case "cafe":
			return "bg-yellow-600";
		case "restaurant":
			return "bg-red-600";
		case "hotel":
			return "bg-green-600";
		case "shop":
			return "bg-purple-600";
		default:
			return "bg-slate-600";
	}
}

type PlaceExplorerLayerProps = {
	places: Place[];
	category: PlaceCategory;
	onCategoryChange: (category: PlaceCategory) => void;
	isLoading: boolean;
	loadFailed: boolean;
	onRetry: () => void;
};

function PlaceExplorerLayer({
	places,
	category,
	onCategoryChange,
	isLoading,
	loadFailed,
	onRetry,
}: PlaceExplorerLayerProps) {
	const { map, isLoaded } = useMap();
	const [zoom, setZoom] = useState(map?.getZoom() ?? 0);
	const [visibleBounds, setVisibleBounds] = useState(map?.getBounds() ?? null);

	useEffect(() => {
		if (!map || !isLoaded) return;
		const updateViewport = () => {
			setZoom(map.getZoom());
			setVisibleBounds(map.getBounds());
		};
		updateViewport();
		map.on("zoomend", updateViewport);
		map.on("moveend", updateViewport);
		return () => {
			map.off("zoomend", updateViewport);
			map.off("moveend", updateViewport);
		};
	}, [map, isLoaded]);

	const matchingPlaces = useMemo(() => {
		if (!visibleBounds) return [];
		return places.filter((place) => {
			if (place.latitude === null || place.longitude === null) return false;
			const longitude = Number(place.longitude);
			const latitude = Number(place.latitude);
			if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
				return false;
			}
			return (
				(category === "all" || getPlaceCategory(place.category) === category) &&
				visibleBounds.contains([longitude, latitude])
			);
		});
	}, [category, places, visibleBounds]);

	if (!isLoaded || !map) return null;

	return (
		<>
			<div className="absolute top-3 right-3 z-20 w-[min(22rem,calc(100%-1.5rem))] rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
				<p className="mb-2 text-sm font-semibold">Explore places</p>
				<fieldset className="flex flex-wrap gap-1.5">
					<legend className="sr-only">Filter place categories</legend>
					{placeCategories.map((option) => (
						<button
							key={option.id}
							type="button"
							aria-pressed={category === option.id}
							className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
								category === option.id
									? "border-primary bg-primary text-primary-foreground"
									: "bg-background text-muted-foreground hover:bg-accent"
							}`}
							onClick={() => onCategoryChange(option.id)}
						>
							{option.label}
						</button>
					))}
				</fieldset>
				<p className="text-muted-foreground mt-2 text-xs" aria-live="polite">
					{loadFailed ? (
						<>
							Some locations could not be loaded.{" "}
							<button type="button" className="underline" onClick={onRetry}>
								Retry
							</button>
						</>
					) : isLoading ? (
						`Loading locations… ${places.length.toLocaleString()} loaded`
					) : zoom < MINIMUM_ZOOM ? (
						"Zoom in to see places on the map."
					) : (
						`${Math.min(matchingPlaces.length, MAX_VISIBLE_PLACES)} of ${matchingPlaces.length} places in view`
					)}
				</p>
				<a
					className="text-muted-foreground mt-1 inline-block text-[10px] underline"
					href="https://www.openstreetmap.org/copyright"
					target="_blank"
					rel="noreferrer"
				>
					Place data © OpenStreetMap contributors
				</a>
			</div>

			{zoom >= MINIMUM_ZOOM &&
				matchingPlaces.slice(0, MAX_VISIBLE_PLACES).map((place) => {
					const longitude = Number(place.longitude);
					const latitude = Number(place.latitude);
					const placeCategory = getPlaceCategory(place.category);
					return (
						<MapMarker key={place.id} longitude={longitude} latitude={latitude}>
							<MarkerContent>
								<div
									className={`flex size-5 items-center justify-center rounded-full border border-white shadow-md ${getPlaceColor(placeCategory)}`}
								>
									{getPlaceIcon(placeCategory)}
								</div>
								<MarkerTooltip>
									{place.name ?? place.category}
									{place.city && ` · ${place.city}`}
								</MarkerTooltip>
								<MarkerPopup
									maxWidth="260px"
									className="w-65 max-w-[calc(100vw-2rem)] bg-popover p-3 text-left text-popover-foreground"
								>
									<div className="space-y-2 text-sm">
										<div>
											<h3 className="font-semibold">
												{place.name ? (
													<ArabicPlaceName name={place.name} />
												) : (
													place.category
												)}
											</h3>
											<p className="text-muted-foreground capitalize">
												{place.category}
												{place.city && ` · ${place.city}`}
											</p>
										</div>
										{place.images[0] && (
											<figure>
												<img
													className="max-h-36 w-full rounded-sm object-cover"
													src={place.images[0].url}
													alt={
														place.images[0].alt || place.name || place.category
													}
													loading="lazy"
												/>
												<figcaption className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
													<span className="truncate">
														{place.images[0].credit || place.images[0].alt}
													</span>
													{place.images[0].source && (
														<a
															href={place.images[0].source}
															target="_blank"
															rel="noreferrer"
															className="shrink-0 underline"
														>
															Image source
														</a>
													)}
												</figcaption>
											</figure>
										)}
										{place.description && (
											<PlaceMarkdown className="line-clamp-4">
												{place.description}
											</PlaceMarkdown>
										)}
										{place.wikipediaUrl && (
											<a
												href={place.wikipediaUrl}
												target="_blank"
												rel="noreferrer"
												className="inline-block text-xs underline"
											>
												Read more on Wikipedia
											</a>
										)}
									</div>
								</MarkerPopup>
							</MarkerContent>
						</MapMarker>
					);
				})}
		</>
	);
}

export default PlaceExplorerLayer;
