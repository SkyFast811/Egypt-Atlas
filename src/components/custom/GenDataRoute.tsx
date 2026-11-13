import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
	ChevronDown,
	ChevronUp,
	Clock3,
	Loader2,
	MapPinned,
	Route as RouteIcon,
} from "lucide-react";

import { LngLatBounds } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import z from "zod";
import { getPlaceCategory, type PlaceCategory } from "#/lib/place-categories";
import type { Place } from "#/lib/place-types";
import { turnIcon, turnStyle } from "../../utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import {
	MapMarker,
	MapRoute,
	MarkerContent,
	MarkerTooltip,
	useMap,
} from "../ui/map";

const GetRouteInputSchema = z
	.array(z.tuple([z.number().finite(), z.number().finite()]))
	.min(2)
	.max(10);

export type OsrmGeoJsonResponse = {
	code: string;
	routes: Array<{
		geometry: {
			type: "LineString";
			coordinates: [number, number][];
		};
		duration: number;
		distance: number;
		legs: Array<{
			steps: Array<{
				distance: number;
				name: string;
				maneuver: {
					type: string;
					modifier?: string;
					exit?: number;
					location: [number, number];
				};
			}>;
		}>;
	}>;
};

async function createMapRoute(input: [number, number][], signal: AbortSignal) {
	const coordinates = GetRouteInputSchema.parse(input);
	const coords = coordinates
		.map(([longitude, latitude]) => `${longitude},${latitude}`)
		.join(";");
	const response = await fetch(
		`https://router.project-osrm.org/route/v1/driving/${coords}?overview=simplified&geometries=geojson&steps=true`,
		{ signal },
	);

	if (!response.ok) throw new Error("Failed to fetch route");

	const route = (await response.json()) as OsrmGeoJsonResponse;
	if (route.code !== "Ok" || !route.routes[0]?.geometry.coordinates.length) {
		throw new Error("No drivable route was found between these points");
	}

	return route;
}

type GenDataRouteProps = {
	coordinates: [number, number][];
	places: Place[];
	placeCategory: PlaceCategory;
};

const PLACE_ROUTE_DISTANCE_KM = 5;
const ROUTE_VISIBILITY_ZOOM = 7.5;
const ROUTE_INFO_ALWAYS_VISIBLE_DISTANCE_METERS = 150_000;
const EMPTY_COORDINATES: [number, number][] = [];

function distanceToRouteSegmentKm(
	point: [number, number],
	start: [number, number],
	end: [number, number],
) {
	const latitudeScale = 110.574;
	const longitudeScale =
		111.32 * Math.cos(((start[1] + end[1]) / 2) * (Math.PI / 180));
	const pointX = (point[0] - start[0]) * longitudeScale;
	const pointY = (point[1] - start[1]) * latitudeScale;
	const endX = (end[0] - start[0]) * longitudeScale;
	const endY = (end[1] - start[1]) * latitudeScale;
	const segmentLengthSquared = endX ** 2 + endY ** 2;
	const progress =
		segmentLengthSquared === 0
			? 0
			: Math.max(
					0,
					Math.min(1, (pointX * endX + pointY * endY) / segmentLengthSquared),
				);
	const closestX = endX * progress;
	const closestY = endY * progress;

	return Math.hypot(pointX - closestX, pointY - closestY);
}

function isPlaceNearRoute(
	place: Place,
	routeCoordinates: [number, number][],
): boolean {
	if (place.latitude === null || place.longitude === null) return false;

	const point: [number, number] = [
		Number(place.longitude),
		Number(place.latitude),
	];
	if (!point.every(Number.isFinite)) return false;

	for (let index = 1; index < routeCoordinates.length; index += 1) {
		if (
			distanceToRouteSegmentKm(
				point,
				routeCoordinates[index - 1],
				routeCoordinates[index],
			) <= PLACE_ROUTE_DISTANCE_KM
		) {
			return true;
		}
	}

	return false;
}

function getStepInstruction(
	step: OsrmGeoJsonResponse["routes"][number]["legs"][number]["steps"][number],
) {
	const { type, modifier, exit } = step.maneuver;
	const direction = modifier ? ` ${modifier}` : "";
	switch (type) {
		case "depart":
			return "Start your route";
		case "arrive":
			return "Arrive at your destination";
		case "turn":
			return `Turn${direction}`;
		case "new name":
		case "continue":
			return `Continue${direction}`;
		case "merge":
			return `Merge${direction}`;
		case "fork":
			return `Keep${direction}`;
		case "end of road":
			return `At the end of the road, turn${direction}`;
		case "on ramp":
			return `Take the ramp${direction}`;
		case "off ramp":
			return `Take the exit${direction}`;
		case "roundabout":
		case "rotary":
			return `Enter the roundabout${exit ? ` and take exit ${exit}` : ""}`;
		case "exit roundabout":
		case "exit rotary":
			return `Exit the roundabout${direction}`;
		case "uturn":
			return "Make a U-turn";
		default:
			return type.charAt(0).toUpperCase() + type.slice(1);
	}
}

export function GenDataRoute(props: GenDataRouteProps) {
	const { map, isLoaded } = useMap();
	const [zoom, setZoom] = useState(map?.getZoom() ?? 0);
	const [showDirections, setShowDirections] = useState(false);

	const {
		data: routeData,
		error,
		isPending,
	} = useQuery({
		queryKey: ["route", props.coordinates],
		queryFn: ({ signal }) => createMapRoute(props.coordinates, signal),
		staleTime: 5 * 60 * 1000,
		gcTime: 30 * 60 * 1000,
		enabled: isLoaded && !!map,
	});

	const fullCoordinates =
		routeData?.routes[0]?.geometry.coordinates ?? EMPTY_COORDINATES;
	const route = routeData?.routes[0];
	const routeSteps = route?.legs.flatMap((leg) => leg.steps) ?? [];
	const routeVisible =
		zoom >= ROUTE_VISIBILITY_ZOOM ||
		(route?.distance ?? 0) >= ROUTE_INFO_ALWAYS_VISIBLE_DISTANCE_METERS;
	const routeInfoVisible = !!route || isPending;

	useEffect(() => {
		if (!map || !isLoaded) return;
		const handleZoom = () => setZoom(map.getZoom());
		setZoom(map.getZoom());
		map.on("zoomend", handleZoom);
		return () => {
			map.off("zoomend", handleZoom);
		};
	}, [map, isLoaded]);

	useEffect(() => {
		if (!map || fullCoordinates.length < 2) return;

		const bounds = new LngLatBounds();
		for (const coordinate of fullCoordinates) bounds.extend(coordinate);
		const camera = map.cameraForBounds(bounds, {
			padding: { top: 100, bottom: 80, left: 40, right: 40 },
			maxZoom: 12,
		});
		if (!camera?.center || camera.zoom === undefined) return;

		map.flyTo({
			center: camera.center,
			zoom: camera.zoom,
			duration: 900,
			essential: true,
		});
	}, [map, fullCoordinates]);
	const nearbyPlaces = useMemo(() => {
		if (fullCoordinates.length < 2) return [];
		const longitudes = fullCoordinates.map(([longitude]) => longitude);
		const latitudes = fullCoordinates.map(([, latitude]) => latitude);
		const latitudePadding = PLACE_ROUTE_DISTANCE_KM / 110.574;
		const middleLatitude =
			(Math.min(...latitudes) + Math.max(...latitudes)) / 2;
		const longitudePadding =
			PLACE_ROUTE_DISTANCE_KM /
			(111.32 * Math.max(0.2, Math.cos((middleLatitude * Math.PI) / 180)));
		const minLongitude = Math.min(...longitudes) - longitudePadding;
		const maxLongitude = Math.max(...longitudes) + longitudePadding;
		const minLatitude = Math.min(...latitudes) - latitudePadding;
		const maxLatitude = Math.max(...latitudes) + latitudePadding;

		return props.places
			.filter((place) => {
				if (place.latitude === null || place.longitude === null) return false;
				const longitude = Number(place.longitude);
				const latitude = Number(place.latitude);
				return (
					Number.isFinite(longitude) &&
					Number.isFinite(latitude) &&
					longitude >= minLongitude &&
					longitude <= maxLongitude &&
					latitude >= minLatitude &&
					latitude <= maxLatitude &&
					(props.placeCategory === "all" ||
						getPlaceCategory(place.category) === props.placeCategory) &&
					isPlaceNearRoute(place, fullCoordinates)
				);
			})
			.slice(0, 60);
	}, [props.places, props.placeCategory, fullCoordinates]);

	function formatDuration(seconds: number): string {
		const mins = Math.round(seconds / 60);
		if (mins < 60) return `${mins} min`;
		const hours = Math.floor(mins / 60);
		const remainingMins = mins % 60;
		return `${hours}h ${remainingMins}m`;
	}

	function formatDistance(meters: number): string {
		if (meters < 1000) return `${Math.round(meters)} m`;
		return `${(meters / 1000).toFixed(1)} km`;
	}

	if (!isLoaded) {
		return null;
	}

	if (error) {
		return (
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				className="absolute right-3 bottom-3 left-3 z-20 sm:right-3 sm:left-auto"
			>
				<Card className="w-fit max-w-full flex-row items-center gap-2 rounded-lg py-2 pr-3 pl-2 shadow-lg">
					<Badge variant="destructive">Route unavailable</Badge>
					<p className="text-muted-foreground text-xs">
						Unable to generate this route.
					</p>
				</Card>
			</motion.div>
		);
	}

	return (
		<>
			<MapRoute
				coordinates={fullCoordinates}
				color="#64748b"
				width={2.5}
				opacity={0.72}
			/>

			{routeInfoVisible && (
				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.2, ease: "easeOut" }}
					className="absolute right-3 bottom-3 left-3 z-20 sm:right-3 sm:left-auto"
				>
					<Card className="w-fit max-w-full flex-row items-center gap-0 rounded-lg py-0 shadow-lg">
						<CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
							<Badge variant="secondary" className="gap-1">
								{isPending ? (
									<Loader2 className="animate-spin" />
								) : (
									<RouteIcon />
								)}
								{isPending ? "Finding route" : "Route"}
							</Badge>
							<div className="flex items-center gap-1.5 text-xs">
								<Clock3 className="text-muted-foreground size-3.5" />
								<span>{route ? formatDuration(route.duration) : "..."}</span>
							</div>
							<div className="flex items-center gap-1.5 text-xs">
								<MapPinned className="text-muted-foreground size-3.5" />
								<span>{route ? formatDistance(route.distance) : "..."}</span>
							</div>
							{nearbyPlaces.length > 0 && (
								<span className="text-muted-foreground border-l pl-3 text-xs">
									{nearbyPlaces.length} nearby
								</span>
							)}
							{routeSteps.length > 0 && (
								<Button
									type="button"
									variant="ghost"
									size="xs"
									className="h-7"
									aria-expanded={showDirections}
									onClick={() => setShowDirections((current) => !current)}
								>
									Directions
									{showDirections ? <ChevronUp /> : <ChevronDown />}
								</Button>
							)}
							{showDirections && routeSteps.length > 0 && (
								<ol className="max-h-56 basis-full space-y-2 overflow-y-auto border-t pt-2">
									{routeSteps.map((step) => (
										<li
											key={`${step.maneuver.location.join("-")}-${step.maneuver.type}-${step.maneuver.modifier ?? ""}`}
											className="flex items-start justify-between gap-4 text-xs"
										>
											<span className="min-w-0">
												<span className="font-medium">
													{getStepInstruction(step)}
												</span>
												{step.name && (
													<span className="text-muted-foreground block truncate">
														{step.name}
													</span>
												)}
											</span>
											<span className="text-muted-foreground shrink-0">
												{formatDistance(step.distance)}
											</span>
										</li>
									))}
								</ol>
							)}
						</CardContent>
					</Card>
				</motion.div>
			)}
			{routeVisible && fullCoordinates.length >= 2 && (
				<>
					<MapMarker
						longitude={fullCoordinates[0][0]}
						latitude={fullCoordinates[0][1]}
					>
						<MarkerContent>
							{/* <div className="flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-white shadow-lg cursor-pointer hover:bg-blue-700 transition">
							{name}
						</div> */}
							<motion.div
								animate={{ scale: [1, 1.12, 1] }}
								transition={{
									duration: 1.6,
									repeat: Infinity,
									ease: "easeInOut",
								}}
								whileTap={{ scale: 0.95 }}
								whileHover={{ scale: 1.25 }}
							>
								<div
									className={`flex h-6 w-6 items-center justify-center rounded-full border border-white shadow-lg ${turnStyle("modern human made")}`}
								>
									{turnIcon("modern human made")}
								</div>
							</motion.div>

							<MarkerTooltip>نقطة البداية</MarkerTooltip>
						</MarkerContent>
					</MapMarker>
					<MapMarker
						longitude={fullCoordinates[fullCoordinates.length - 1][0]}
						latitude={fullCoordinates[fullCoordinates.length - 1][1]}
					>
						<MarkerContent>
							{/* <div className="flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-white shadow-lg cursor-pointer hover:bg-blue-700 transition">
							{name}
						</div> */}
							<motion.div
								animate={{ scale: [1, 1.12, 1] }}
								transition={{
									duration: 1.6,
									repeat: Infinity,
									ease: "easeInOut",
									delay: 0.2,
								}}
								whileTap={{ scale: 0.95 }}
								whileHover={{ scale: 1.25 }}
							>
								<div
									className={`flex h-6 w-6 items-center justify-center rounded-full border border-white shadow-lg ${turnStyle("modern human made")}`}
								>
									{turnIcon("modern human made")}
								</div>
							</motion.div>

							<MarkerTooltip>نقطة النهاية</MarkerTooltip>
						</MarkerContent>
					</MapMarker>
				</>
			)}
		</>
	);
}
