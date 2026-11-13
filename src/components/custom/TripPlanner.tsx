import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, MapPin, Route, Trash2 } from "lucide-react";
import { useContext, useState } from "react";
import { ArabicPlaceName } from "#/lib/place-names";
import { RoutingContext } from "#/lib/routing-context";
import { deleteTrip, getSavedTrips, saveTrip } from "#/lib/trips.functions";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";

function TripPlanner() {
	const routingContext = useContext(RoutingContext);
	const selectedPositions = routingContext?.[0] ?? [];
	const setSelectedPositions = routingContext?.[1];
	const [tripName, setTripName] = useState("");
	const queryClient = useQueryClient();
	const savedTrips = useQuery({
		queryKey: ["saved-trips"],
		queryFn: () => getSavedTrips(),
	});
	const saveMutation = useMutation({
		mutationFn: () =>
			saveTrip({
				data: { name: tripName, stops: selectedPositions },
			}),
		onSuccess: async () => {
			setTripName("");
			await queryClient.invalidateQueries({ queryKey: ["saved-trips"] });
		},
	});
	const deleteMutation = useMutation({
		mutationFn: (tripId: number) => deleteTrip({ data: { tripId } }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["saved-trips"] });
		},
	});

	const reorderStop = (index: number, offset: -1 | 1) => {
		const nextIndex = index + offset;
		if (
			!setSelectedPositions ||
			nextIndex < 0 ||
			nextIndex >= selectedPositions.length
		) {
			return;
		}
		setSelectedPositions((current) => {
			const reordered = [...current];
			[reordered[index], reordered[nextIndex]] = [
				reordered[nextIndex],
				reordered[index],
			];
			return reordered;
		});
	};

	return (
		<Card className="mb-3">
			<CardHeader className="gap-1">
				<CardTitle className="flex items-center gap-2">
					<Route className="size-4" />
					Plan a trip
				</CardTitle>
				<CardDescription>
					Right-click the map to route to the nearest place and add stops. Up to
					10 stops; the last stop is the finish.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{selectedPositions.length > 0 ? (
					<ol className="space-y-2">
						{selectedPositions.map((stop, index) => (
							<li
								key={`${stop.coordinates[0]}-${stop.coordinates[1]}`}
								className="flex items-center gap-2 rounded-md border p-2"
							>
								<MapPin className="text-muted-foreground size-4 shrink-0" />
								<span className="min-w-0 flex-1 truncate text-sm">
									<span className="text-muted-foreground mr-1">
										{index === 0 ? "Start:" : `Stop ${index}:`}
									</span>
									<ArabicPlaceName name={stop.name} />
								</span>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Move ${stop.name} up`}
									disabled={index === 0}
									onClick={() => reorderStop(index, -1)}
								>
									<ArrowUp />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Move ${stop.name} down`}
									disabled={index === selectedPositions.length - 1}
									onClick={() => reorderStop(index, 1)}
								>
									<ArrowDown />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Remove ${stop.name}`}
									onClick={() =>
										setSelectedPositions?.((current) =>
											current.filter(
												(_, currentIndex) => currentIndex !== index,
											),
										)
									}
								>
									<Trash2 />
								</Button>
							</li>
						))}
					</ol>
				) : (
					<p className="text-muted-foreground text-sm">
						Right-click the map to add the nearest place to your trip.
					</p>
				)}

				{selectedPositions.length >= 10 && (
					<p className="text-muted-foreground text-xs">
						This trip has reached the 10-stop limit.
					</p>
				)}

				<div className="flex flex-col gap-2 sm:flex-row">
					<Button
						type="button"
						variant="outline"
						disabled={selectedPositions.length === 0}
						onClick={() => setSelectedPositions?.([])}
					>
						Clear trip
					</Button>
					<Input
						value={tripName}
						onChange={(event) => setTripName(event.target.value)}
						placeholder="Name this trip"
						aria-label="Name this trip"
						maxLength={100}
					/>
					<Button
						type="button"
						disabled={
							selectedPositions.length < 2 ||
							!tripName.trim() ||
							saveMutation.isPending
						}
						onClick={() => saveMutation.mutate()}
					>
						{saveMutation.isPending ? "Saving..." : "Save trip"}
					</Button>
				</div>

				{saveMutation.error && (
					<p role="alert" className="text-destructive text-sm">
						{saveMutation.error.message}
					</p>
				)}
				{deleteMutation.error && (
					<p role="alert" className="text-destructive text-sm">
						{deleteMutation.error.message}
					</p>
				)}
				{savedTrips.error && (
					<p role="alert" className="text-destructive text-sm">
						{savedTrips.error.message}
					</p>
				)}

				<div className="space-y-2 border-t pt-3">
					<h3 className="text-sm font-semibold">Your saved trips</h3>
					{savedTrips.isPending ? (
						<p className="text-muted-foreground text-sm">Loading trips...</p>
					) : savedTrips.data?.length ? (
						<ul className="space-y-2">
							{savedTrips.data.map((trip) => (
								<li
									key={trip.id}
									className="flex items-center gap-2 rounded-md border p-2"
								>
									<button
										type="button"
										className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
										onClick={() => setSelectedPositions?.(trip.stops)}
									>
										{trip.name}
										<span className="text-muted-foreground ml-2 text-xs">
											{trip.stops.length} stops
										</span>
									</button>
									<Button
										type="button"
										variant="ghost"
										size="icon-xs"
										aria-label={`Delete trip ${trip.name}`}
										disabled={deleteMutation.isPending}
										onClick={() => deleteMutation.mutate(trip.id)}
									>
										<Trash2 />
									</Button>
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground text-sm">
							You haven’t saved any trips yet.
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

export default TripPlanner;
