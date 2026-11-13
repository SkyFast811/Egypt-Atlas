import { useContext, useEffect, useState } from "react";
import { RoutingContext } from "#/lib/routing-context";
import { useMap } from "../ui/map";

type RouteLocation = {
	name: string;
	coordinates: [number, number];
};

type RouteStartLayerProps = {
	locations: RouteLocation[];
};

function distanceBetweenKm(first: [number, number], second: [number, number]) {
	const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
	const [firstLongitude, firstLatitude] = first.map(toRadians);
	const [secondLongitude, secondLatitude] = second.map(toRadians);
	const latitudeDifference = secondLatitude - firstLatitude;
	const longitudeDifference = secondLongitude - firstLongitude;
	const haversine = Math.min(
		1,
		Math.sin(latitudeDifference / 2) ** 2 +
			Math.cos(firstLatitude) *
				Math.cos(secondLatitude) *
				Math.sin(longitudeDifference / 2) ** 2,
	);

	return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function findNearestLocation(
	coordinates: [number, number],
	locations: RouteLocation[],
) {
	let nearest: RouteLocation | undefined;
	let nearestDistance = Number.POSITIVE_INFINITY;

	for (const location of locations) {
		const distance = distanceBetweenKm(coordinates, location.coordinates);
		if (distance < nearestDistance) {
			nearest = location;
			nearestDistance = distance;
		}
	}

	return nearest ? { location: nearest, distanceKm: nearestDistance } : null;
}

function RouteStartLayer({ locations }: RouteStartLayerProps) {
	const { map, isLoaded } = useMap();
	const routingContext = useContext(RoutingContext);
	const selectedPositions = routingContext?.[0] ?? [];
	const setSelectedPositions = routingContext?.[1];
	const [message, setMessage] = useState(
		"Right-click the map to route to the nearest place. Right-click again to add stops.",
	);

	useEffect(() => {
		if (!map || !isLoaded) return;

		const canvasContainer = map.getCanvasContainer();
		const handleContextMenu = (event: MouseEvent) => {
			event.preventDefault();
			if (!setSelectedPositions) {
				setMessage("Sign in to start a route from the map.");
				return;
			}

			const bounds = canvasContainer.getBoundingClientRect();
			const lngLat = map.unproject([
				event.clientX - bounds.left,
				event.clientY - bounds.top,
			]);
			const clickedCoordinates: [number, number] = [lngLat.lng, lngLat.lat];
			const nearest = findNearestLocation(clickedCoordinates, locations);
			if (!nearest) {
				setMessage("No POIs or places are available to route to.");
				return;
			}
			const { location, distanceKm } = nearest;
			const coordinates = location.coordinates;
			if (
				selectedPositions.some(
					(stop) =>
						stop.coordinates[0] === coordinates[0] &&
						stop.coordinates[1] === coordinates[1],
				)
			) {
				setMessage(`${location.name} is already on your route.`);
				return;
			}
			if (selectedPositions.length >= 10) {
				setMessage(
					"This trip has reached the 10-stop limit. Clear the trip to start another.",
				);
				return;
			}
			const nextStopNumber = selectedPositions.length + 1;
			setSelectedPositions([
				...selectedPositions,
				{
					name: location.name,
					coordinates,
				},
			]);
			setMessage(
				nextStopNumber === 1
					? `Route start set to ${location.name} (${distanceKm.toFixed(1)} km from click). Right-click again to add stops.`
					: `Added stop ${nextStopNumber}: ${location.name} (${distanceKm.toFixed(1)} km from click). Right-click again to continue or move the finish.`,
			);
		};

		canvasContainer.addEventListener("contextmenu", handleContextMenu, true);
		return () => {
			canvasContainer.removeEventListener(
				"contextmenu",
				handleContextMenu,
				true,
			);
		};
	}, [isLoaded, locations, map, selectedPositions, setSelectedPositions]);

	return (
		<div
			aria-live="polite"
			className="absolute bottom-3 left-3 z-20 max-w-[calc(100%-1.5rem)] rounded-md border bg-background/95 px-3 py-2 text-xs shadow-sm"
		>
			{message}
		</div>
	);
}

export default RouteStartLayer;
