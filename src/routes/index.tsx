import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion, useReducedMotion } from "framer-motion";
import { Image, Layers2, MapPin, Search, X } from "lucide-react";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { GenDataRoute } from "#/components/custom/GenDataRoute";
import LocationTrackingLayer from "#/components/custom/LocationTrackingLayer";
import MapGenCluster from "#/components/custom/MapGenCluster";
import PlaceExplorerLayer from "#/components/custom/PlaceExplorerLayer";
import ReturnButtonLayer from "#/components/custom/ReturnButtonLayer";
import RouteStartLayer from "#/components/custom/RouteStartLayer";
import TripPlanner from "#/components/custom/TripPlanner";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import {
	MapMarker,
	type MapRef,
	Map as MapView,
	MarkerContent,
	MarkerTooltip,
} from "#/components/ui/map";
import { authClient } from "#/lib/auth-client";
import type { PlaceCategory } from "#/lib/place-categories";
import { matchesPlaceName } from "#/lib/place-name-variations";
import { ArabicPlaceName } from "#/lib/place-names";
import { PLACES_PAGE_SIZE, type Place } from "#/lib/place-types";
import type { RouteStop } from "#/lib/routing-context";
import { RoutingContext } from "#/lib/routing-context";
import { turnIcon, turnStyle } from "#/utils";
import { getEgyptPois, getPlacesPage } from "./-index.functions";

export const Route = createFileRoute("/")({
	loader: async () => {
		const [pois, places] = await Promise.all([
			getEgyptPois(),
			getPlacesPage({ data: { afterId: 0 } }),
		]);
		return { ...pois, places };
	},
	component: RouteComponent,
});

type MapViewport = {
	center: [number, number];
	zoom: number;
	bearing: number;
	pitch: number;
};

const DEFAULT_MAP_VIEWPORT: MapViewport = {
	center: [31.0161, 27.0506],
	zoom: 4.9,
	bearing: 0,
	pitch: 0,
};
const MAP_VIEWPORT_STORAGE_KEY = "egypt-atlas:home-map-viewport:v1";

function isMapViewport(value: unknown): value is MapViewport {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<MapViewport>;
	return (
		Array.isArray(candidate.center) &&
		candidate.center.length === 2 &&
		typeof candidate.center[0] === "number" &&
		Number.isFinite(candidate.center[0]) &&
		Math.abs(candidate.center[0]) <= 360 &&
		typeof candidate.center[1] === "number" &&
		Number.isFinite(candidate.center[1]) &&
		candidate.center[1] >= -90 &&
		candidate.center[1] <= 90 &&
		typeof candidate.zoom === "number" &&
		Number.isFinite(candidate.zoom) &&
		candidate.zoom >= 0 &&
		candidate.zoom <= 24 &&
		typeof candidate.bearing === "number" &&
		Number.isFinite(candidate.bearing) &&
		typeof candidate.pitch === "number" &&
		Number.isFinite(candidate.pitch) &&
		candidate.pitch >= 0 &&
		candidate.pitch <= 85
	);
}

function getSavedMapViewport(): MapViewport {
	if (typeof window === "undefined") return DEFAULT_MAP_VIEWPORT;

	try {
		const savedViewport = window.localStorage.getItem(MAP_VIEWPORT_STORAGE_KEY);
		if (!savedViewport) return DEFAULT_MAP_VIEWPORT;

		const parsed: unknown = JSON.parse(savedViewport);
		if (isMapViewport(parsed)) return parsed;
		console.warn("Saved map viewport is invalid; using the default viewport.");
	} catch (error) {
		console.warn("Could not read the saved map viewport.", error);
	}

	return DEFAULT_MAP_VIEWPORT;
}

function RouteComponent() {
	const loaderData = Route.useLoaderData();
	const fetchPlacesPage = useServerFn(getPlacesPage);
	const mapRef = useRef<MapRef>(null);
	const [initialMapViewport] = useState(getSavedMapViewport);
	const mapViewportRef = useRef<MapViewport>(initialMapViewport);
	const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const placesRef = useRef<Place[]>(loaderData.places);
	const placesLoadGeneration = useRef(0);
	const [places, setPlaces] = useState<Place[]>(loaderData.places);
	const [isLoadingPlaces, setIsLoadingPlaces] = useState(true);
	const [placesLoadFailed, setPlacesLoadFailed] = useState(false);
	const [isHydrated, setIsHydrated] = useState(false);
	const [selectedSearchPoiId, setSelectedSearchPoiId] = useState<number | null>(
		null,
	);
	const prefersReducedMotion = useReducedMotion();
	const { data: session, isPending: isAuthPending } = authClient.useSession();
	const userId = session?.user.id;
	const [selectedPositions, setSelectedPositions] = useState<RouteStop[]>([]);
	const [placeCategory, setPlaceCategory] = useState<PlaceCategory>("all");
	useEffect(() => {
		setIsHydrated(true);
	}, []);
	const flushSavedMapViewport = useCallback(() => {
		if (viewportSaveTimerRef.current !== null) {
			clearTimeout(viewportSaveTimerRef.current);
			viewportSaveTimerRef.current = null;
		}

		try {
			window.localStorage.setItem(
				MAP_VIEWPORT_STORAGE_KEY,
				JSON.stringify(mapViewportRef.current),
			);
		} catch (error) {
			console.error("Could not save the map viewport.", error);
		}
	}, []);
	const saveMapViewport = useCallback((viewport: MapViewport) => {
		mapViewportRef.current = viewport;
		if (viewportSaveTimerRef.current !== null) {
			clearTimeout(viewportSaveTimerRef.current);
		}
		viewportSaveTimerRef.current = setTimeout(() => {
			viewportSaveTimerRef.current = null;
			try {
				window.localStorage.setItem(
					MAP_VIEWPORT_STORAGE_KEY,
					JSON.stringify(mapViewportRef.current),
				);
			} catch (error) {
				console.error("Could not save the map viewport.", error);
			}
		}, 250);
	}, []);
	useEffect(() => {
		window.addEventListener("pagehide", flushSavedMapViewport);
		return () => {
			window.removeEventListener("pagehide", flushSavedMapViewport);
			flushSavedMapViewport();
		};
	}, [flushSavedMapViewport]);
	const loadRemainingPlaces = useCallback(async () => {
		const generation = ++placesLoadGeneration.current;
		setIsLoadingPlaces(true);
		setPlacesLoadFailed(false);

		try {
			let afterId = placesRef.current.at(-1)?.id ?? 0;
			while (true) {
				const page = await fetchPlacesPage({ data: { afterId } });
				if (generation !== placesLoadGeneration.current) return;
				if (page.length === 0) break;

				placesRef.current = [...placesRef.current, ...page];
				setPlaces(placesRef.current);
				afterId = page[page.length - 1].id;
				if (page.length < PLACES_PAGE_SIZE) break;
			}
		} catch (error) {
			console.error("Failed to load all map places.", error);
			if (generation === placesLoadGeneration.current) {
				setPlacesLoadFailed(true);
			}
		} finally {
			if (generation === placesLoadGeneration.current) {
				setIsLoadingPlaces(false);
			}
		}
	}, [fetchPlacesPage]);

	useEffect(() => {
		void loadRemainingPlaces();
		return () => {
			placesLoadGeneration.current += 1;
		};
	}, [loadRemainingPlaces]);
	useEffect(() => {
		if (!userId) setSelectedPositions([]);
	}, [userId]);
	const [searchText, setSearchText] = useState("");
	const deferredSearchText = useDeferredValue(searchText);
	const allPois = useMemo(() => {
		const rows = [
			...loaderData.northWest,
			...loaderData.northCenter,
			...loaderData.northEast,
			...loaderData.centerWest,
			...loaderData.centerCenter,
			...loaderData.centerEast,
			...loaderData.southWest,
			...loaderData.southCenter,
			...loaderData.southEast,
		];
		return [...new Map(rows.map((poi) => [poi.id, poi])).values()];
	}, [loaderData]);
	const routeLocations = useMemo(() => {
		const locations: RouteStop[] = allPois.map((poi) => ({
			name: poi.name,
			coordinates: [poi.lng, poi.lat],
		}));

		for (const place of places) {
			if (place.latitude === null || place.longitude === null) continue;
			const longitude = Number(place.longitude);
			const latitude = Number(place.latitude);
			if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;

			locations.push({
				name:
					place.name?.trim() ||
					(place.city ? `${place.category} in ${place.city}` : place.category),
				coordinates: [longitude, latitude],
			});
		}

		return locations;
	}, [allPois, places]);
	const searchResults = useMemo(() => {
		const query = deferredSearchText.trim().toLocaleLowerCase();
		if (!query) return [];
		return allPois
			.filter(
				(poi) =>
					matchesPlaceName(poi.name, query, poi.alternateNames) ||
					`${poi.category} ${poi.description} ${poi.wikipediaSummary} ${poi.historyNotes}`
						.toLocaleLowerCase()
						.includes(query),
			)
			.slice(0, 8);
	}, [allPois, deferredSearchText]);
	const selectedSearchPoi = allPois.find(
		(poi) => poi.id === selectedSearchPoiId,
	);
	const selectSearchResult = (poi: (typeof allPois)[number]) => {
		setSearchText("");
		setSelectedSearchPoiId(poi.id);
		mapRef.current?.flyTo({
			center: [poi.lng, poi.lat],
			zoom: 10,
			duration: 650,
			essential: true,
		});
	};

	return (
		<div className="relative w-full">
			<RoutingContext.Provider
				value={session?.user ? [selectedPositions, setSelectedPositions] : null}
			>
				<MapKeyModal />
				<MapView
					className="h-[min(72vh,44rem)] min-h-128 w-full rounded-sm"
					ref={mapRef}
					center={mapViewportRef.current.center}
					zoom={mapViewportRef.current.zoom}
					bearing={mapViewportRef.current.bearing}
					pitch={mapViewportRef.current.pitch}
					onViewportChange={saveMapViewport}
					dragPan={false}
					scrollZoom={false}
					boxZoom={false}
					doubleClickZoom={false}
					dragRotate={false}
					touchZoomRotate={false}
					touchPitch={false}
					keyboard={false}
					controls={
						<>
							<LocationTrackingLayer />
							{selectedSearchPoi && (
								<SearchResultHighlight
									place={selectedSearchPoi}
									prefersReducedMotion={Boolean(prefersReducedMotion)}
								/>
							)}
						</>
					}
				>
					<ReturnButtonLayer />
					<RouteStartLayer locations={routeLocations} />
					<PlaceExplorerLayer
						places={places}
						category={placeCategory}
						onCategoryChange={setPlaceCategory}
						isLoading={isLoadingPlaces}
						loadFailed={placesLoadFailed}
						onRetry={() => void loadRemainingPlaces()}
					/>

					<MapGenCluster data={loaderData.centerEast} name="East" />
					<MapGenCluster data={loaderData.centerWest} name="West" />
					<MapGenCluster data={loaderData.northCenter} name="North" />
					<MapGenCluster data={loaderData.southCenter} name="South" />
					<MapGenCluster data={loaderData.northWest} name="North West" />
					<MapGenCluster data={loaderData.northEast} name="North East" />
					<MapGenCluster data={loaderData.southWest} name="South West" />
					<MapGenCluster data={loaderData.southEast} name="South East" />
					<MapGenCluster data={loaderData.centerCenter} name="Center" />
					{selectedPositions.length >= 2 && (
						<GenDataRoute
							coordinates={selectedPositions.map((stop) => stop.coordinates)}
							places={places}
							placeCategory={placeCategory}
						/>
					)}
					{selectedPositions.length === 1 && (
						<MapMarker
							longitude={selectedPositions[0].coordinates[0]}
							latitude={selectedPositions[0].coordinates[1]}
						>
							<MarkerContent>
								<MapPin className="size-7 fill-blue-600 text-white drop-shadow-md" />
								<MarkerTooltip>
									<ArabicPlaceName name={selectedPositions[0].name} />
								</MarkerTooltip>
							</MarkerContent>
						</MapMarker>
					)}
				</MapView>
				{isHydrated && !isAuthPending && session?.user ? (
					<TripPlanner />
				) : (
					isHydrated &&
					!isAuthPending && (
						<Card className="my-3 border-amber-400/30">
							<CardContent className="flex flex-col items-start justify-between gap-3 pt-6 sm:flex-row sm:items-center">
								<p className="text-sm">
									Sign in to plan and save multi-stop trips or track your
									location.
								</p>
								<Button asChild>
									<Link to="/auth">Sign in or create an account</Link>
								</Button>
							</CardContent>
						</Card>
					)
				)}
			</RoutingContext.Provider>
			<section
				className="mx-auto mt-3 w-full max-w-3xl"
				aria-label="Search places"
			>
				<div className="relative">
					<Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
					<Input
						value={searchText}
						onChange={(event) => setSearchText(event.target.value)}
						placeholder="Search Egypt’s places and landmarks"
						aria-label="Search Egypt’s places and landmarks"
						className="h-11 bg-background pl-10 pr-11"
					/>
					{searchText && (
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Clear search"
							className="absolute top-1/2 right-1 -translate-y-1/2"
							onClick={() => setSearchText("")}
						>
							<X />
						</Button>
					)}
				</div>
				{deferredSearchText.trim() && (
					<div className="mt-1 max-h-80 overflow-y-auto rounded-md border bg-background shadow-lg">
						{searchResults.length > 0 ? (
							searchResults.map((poi) => (
								<button
									key={poi.id}
									type="button"
									className="flex w-full items-center gap-3 border-b p-2 text-left last:border-b-0 hover:bg-accent"
									onClick={() => selectSearchResult(poi)}
								>
									{poi.images[0] ? (
										<img
											className="size-14 shrink-0 rounded-sm object-cover"
											src={poi.images[0].url}
											alt={poi.images[0].alt || poi.name}
											loading="lazy"
										/>
									) : (
										<div className="bg-muted text-muted-foreground flex size-14 shrink-0 items-center justify-center rounded-sm">
											<Image className="size-5" />
										</div>
									)}
									<span className="min-w-0">
										<span className="block truncate text-sm font-medium">
											<ArabicPlaceName
												name={poi.name}
												arabicName={poi.arabicName}
											/>
										</span>
										<span className="text-muted-foreground block truncate text-xs capitalize">
											{poi.category}
										</span>
										<span className="text-muted-foreground block truncate text-xs">
											{poi.images.length > 0
												? `${poi.images.length} image${poi.images.length === 1 ? "" : "s"}`
												: "No stored photos"}
										</span>
									</span>
									<MapPin className="text-muted-foreground ml-auto size-4 shrink-0" />
								</button>
							))
						) : (
							<p className="text-muted-foreground p-3 text-sm">
								No matching places.
							</p>
						)}
					</div>
				)}
			</section>
		</div>
	);
}

function SearchResultHighlight({
	place,
	prefersReducedMotion,
}: {
	place: { id: number; name: string; lng: number; lat: number };
	prefersReducedMotion: boolean;
}) {
	return (
		<MapMarker key={place.id} longitude={place.lng} latitude={place.lat}>
			<MarkerContent className="z-10">
				<div className="relative flex flex-col items-center">
					{!prefersReducedMotion && (
						<>
							<motion.span
								aria-hidden="true"
								className="pointer-events-none absolute top-1 size-12 rounded-full border-2 border-amber-300"
								animate={{ scale: [0.55, 1.8], opacity: [0.75, 0] }}
								transition={{
									duration: 1.6,
									repeat: Number.POSITIVE_INFINITY,
									ease: "easeOut",
								}}
							/>
							<motion.span
								aria-hidden="true"
								className="pointer-events-none absolute top-1 size-12 rounded-full border-2 border-amber-300"
								animate={{ scale: [0.55, 1.8], opacity: [0.75, 0] }}
								transition={{
									duration: 1.6,
									delay: 0.8,
									repeat: Number.POSITIVE_INFINITY,
									ease: "easeOut",
								}}
							/>
						</>
					)}
					<motion.div
						role="img"
						aria-label={`Search result: ${place.name}`}
						className="relative z-10 rounded-full border-2 border-white bg-amber-500 p-2.5 text-white shadow-[0_0_24px_rgba(245,158,11,0.8)]"
						initial={prefersReducedMotion ? false : { scale: 0, y: 12 }}
						animate={
							prefersReducedMotion
								? { scale: 1, y: 0 }
								: { scale: [0, 1.35, 1], y: [12, -8, 0] }
						}
						transition={{
							type: "spring",
							stiffness: 420,
							damping: 16,
							duration: 0.65,
						}}
					>
						<MapPin className="size-7 fill-amber-500 text-white" />
					</motion.div>
					<motion.span
						className="relative z-10 mt-1 max-w-48 truncate rounded-full border border-amber-300/70 bg-background/95 px-2.5 py-1 text-xs font-semibold shadow-lg"
						initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: prefersReducedMotion ? 0 : 0.15 }}
					>
						{place.name}
					</motion.span>
					<MarkerTooltip>{place.name}</MarkerTooltip>
				</div>
			</MarkerContent>
		</MapMarker>
	);
}

const mapKeyItems = [
	{ category: "historic human made", label: "Historic site" },
	{ category: "modern human made", label: "Modern place" },
	{ category: "natural", label: "Natural feature" },
] as const;

function MapKeyModal() {
	const [isOpen, setIsOpen] = useState(false);
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		if (isOpen && !dialogRef.current?.open) dialogRef.current?.showModal();
	}, [isOpen]);

	return (
		<>
			<Button
				type="button"
				variant="secondary"
				className="absolute top-3 left-3 z-20"
				aria-haspopup="dialog"
				onClick={() => setIsOpen(true)}
			>
				<Layers2 className="size-4" />
				Map key
			</Button>
			<dialog
				ref={dialogRef}
				aria-labelledby="map-key-title"
				className="fixed inset-0 m-auto w-[min(24rem,calc(100%-2rem))] rounded-xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60"
				onClose={() => setIsOpen(false)}
			>
				<div className="flex items-start justify-between gap-4 border-b p-5">
					<div>
						<h2 id="map-key-title" className="text-lg font-semibold">
							Map key
						</h2>
						<p className="text-muted-foreground mt-1 text-sm">
							What the map markers and route line represent.
						</p>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Close map key"
						onClick={() => dialogRef.current?.close()}
					>
						<X />
					</Button>
				</div>
				<div className="space-y-3 p-5">
					{mapKeyItems.map(({ category, label }) => (
						<div key={category} className="flex items-center gap-3">
							<span
								className={`flex size-7 items-center justify-center rounded-full ${turnStyle(category)}`}
							>
								{turnIcon(category)}
							</span>
							<span className="text-sm">{label}</span>
						</div>
					))}
					<div className="flex items-center gap-3 border-t pt-3">
						<span className="relative flex size-7 items-center justify-center">
							<span className="h-1 w-6 rounded-full bg-blue-500" />
							<MapPin className="absolute size-4 fill-blue-600 text-white" />
						</span>
						<span className="text-sm">Your planned route and stops</span>
					</div>
					<p className="text-muted-foreground border-t pt-3 text-xs leading-relaxed">
						Right-click the map to set a route start, then right-click again to
						add stops and move the finish. Clicking places only opens their
						details.
					</p>
				</div>
			</dialog>
		</>
	);
}
