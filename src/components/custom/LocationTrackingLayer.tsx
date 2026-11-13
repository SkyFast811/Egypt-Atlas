import { Link } from "@tanstack/react-router";
import { Locate, LocateFixed } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { authClient } from "#/lib/auth-client";
import { Button } from "../ui/button";
import { MapMarker, MarkerContent, useMap } from "../ui/map";

type UserLocation = {
	longitude: number;
	latitude: number;
};

function LocationTrackingLayer() {
	const { map, isLoaded } = useMap();
	const { data: session, isPending } = authClient.useSession();
	const userId = session?.user.id;
	const [isTracking, setIsTracking] = useState(false);
	const [location, setLocation] = useState<UserLocation | null>(null);
	const [error, setError] = useState<string | null>(null);
	const watchIdRef = useRef<number | null>(null);
	const hasCenteredRef = useRef(false);

	useEffect(
		() => () => {
			if (watchIdRef.current !== null) {
				navigator.geolocation.clearWatch(watchIdRef.current);
			}
		},
		[],
	);
	useEffect(() => {
		if (isPending || userId || watchIdRef.current === null) return;
		navigator.geolocation.clearWatch(watchIdRef.current);
		watchIdRef.current = null;
		hasCenteredRef.current = false;
		setIsTracking(false);
		setLocation(null);
	}, [isPending, userId]);

	if (!map || isPending) return null;

	if (!session?.user) {
		return (
			<div className="absolute right-3 bottom-3 z-20 rounded-md border bg-background/95 p-3 shadow-sm">
				<p className="mb-2 text-sm">Sign in to track your location.</p>
				<Button asChild size="sm">
					<Link to="/auth">Sign in</Link>
				</Button>
			</div>
		);
	}

	const stopTracking = () => {
		if (watchIdRef.current !== null) {
			navigator.geolocation.clearWatch(watchIdRef.current);
			watchIdRef.current = null;
		}
		hasCenteredRef.current = false;
		setIsTracking(false);
	};

	const startTracking = () => {
		if (!navigator.geolocation) {
			setError("Geolocation is not available in this browser.");
			return;
		}

		setError(null);
		hasCenteredRef.current = false;

		try {
			watchIdRef.current = navigator.geolocation.watchPosition(
				(position) => {
					const nextLocation = {
						longitude: position.coords.longitude,
						latitude: position.coords.latitude,
					};
					setLocation(nextLocation);
					setError(null);

					if (!hasCenteredRef.current) {
						map.flyTo({
							center: [nextLocation.longitude, nextLocation.latitude],
							zoom: 14,
							duration: 1000,
							essential: true,
						});
						hasCenteredRef.current = true;
					} else {
						map.easeTo({
							center: [nextLocation.longitude, nextLocation.latitude],
							duration: 500,
							essential: true,
						});
					}
				},
				(positionError) => {
					const messages: Record<number, string> = {
						1: "Location permission was denied. Allow location access in your browser to track yourself.",
						2: "Your current location could not be determined.",
						3: "The location request timed out. Try again.",
					};
					setError(
						messages[positionError.code] ??
							"Location tracking failed. Try again.",
					);
					stopTracking();
				},
				{ enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
			);
			setIsTracking(true);
		} catch {
			setError("Location tracking could not be started. Try again.");
			stopTracking();
		}
	};

	return (
		<>
			<div className="absolute right-3 bottom-3 z-20 flex max-w-72 flex-col items-end gap-2">
				<Button
					type="button"
					variant={isTracking ? "default" : "secondary"}
					aria-pressed={isTracking}
					onClick={isTracking ? stopTracking : startTracking}
				>
					{isTracking ? (
						<LocateFixed className="size-4" />
					) : (
						<Locate className="size-4" />
					)}
					{isTracking ? "Stop tracking" : "Track my location"}
				</Button>
				{error && (
					<p
						role="alert"
						className="rounded-md border border-destructive/50 bg-background/95 px-3 py-2 text-right text-xs text-destructive shadow-sm"
					>
						{error}
					</p>
				)}
			</div>
			{location && isLoaded && (
				<MapMarker longitude={location.longitude} latitude={location.latitude}>
					<MarkerContent>
						<div
							role="img"
							aria-label="Your current location"
							className="relative flex size-8 items-center justify-center"
						>
							<span className="absolute size-8 animate-ping rounded-full bg-blue-500/20" />
							<span className="relative size-4 rounded-full border-2 border-white bg-blue-600 shadow-lg ring-2 ring-blue-600/40" />
						</div>
					</MarkerContent>
				</MapMarker>
			)}
		</>
	);
}

export default LocationTrackingLayer;
