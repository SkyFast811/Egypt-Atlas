import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { LngLat, LngLatBounds } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import { PlaceMarkdown } from "#/components/custom/PlaceMarkdown";
import PlacePopupImages from "#/components/custom/PlacePopupImages";
import type { PlaceMediaImage } from "#/lib/place-media";
import { ArabicPlaceName } from "#/lib/place-names";
import { turnIcon, turnStyle } from "#/utils";
import {
	MapMarker,
	MarkerContent,
	MarkerPopup,
	MarkerTooltip,
	useMap,
} from "../ui/map";

type MapGenClusterProps = {
	data: {
		id?: number;
		name: string;
		arabicName: string | null;
		lng: number;
		lat: number;
		category: "natural" | "modern human made" | "historic human made";
		alternateNames: string[];
		description: string;
		images: PlaceMediaImage[];
		infoTips: string[];
		historyNotes: string;
		funActivities: string[];
		bestVisitSeason: string;
	}[];
	name: string;
};

function MapGenCluster({ data, name }: MapGenClusterProps) {
	const { map, isLoaded } = useMap();
	const navigate = useNavigate();
	const [expanded, setExpanded] = useState(false);
	const [photoPlaceId, setPhotoPlaceId] = useState<number | null>(null);
	const [zoom, setZoom] = useState(map?.getZoom() ?? 0);
	const [visibleBounds, setVisibleBounds] = useState<LngLatBounds | null>(null);
	const bounds = new LngLatBounds();
	data.forEach((item) => {
		bounds.extend([item.lng, item.lat]);
	});
	const cameraOptions = map?.cameraForBounds(bounds, {
		padding: 50,
	});
	const optimalZoom = cameraOptions?.zoom;
	const optimalCenter = cameraOptions?.center;

	useEffect(() => {
		if (!map) return;
		setZoom(map.getZoom());
		setVisibleBounds(map.getBounds());
		const handleZoom = () => {
			const nextZoom = map.getZoom();
			setZoom(nextZoom);
			if (nextZoom < 5.5) setExpanded(false);
			setVisibleBounds(map.getBounds());
		};
		map.on("zoomend", handleZoom);
		map.on("moveend", handleZoom);
		return () => {
			map.off("zoomend", handleZoom);
			map.off("moveend", handleZoom);
		};
	}, [map]);
	const visibleData = useMemo(() => {
		if (!isLoaded || !visibleBounds) return [];
		return data.filter((item) => visibleBounds.contains([item.lng, item.lat]));
	}, [data, isLoaded, visibleBounds]);

	const handleClusterClick = () => {
		if (!map || !optimalCenter) return;
		setExpanded(true);
		map.flyTo({
			center: optimalCenter,
			zoom: Math.max(optimalZoom ?? map.getZoom(), 5.8),
			duration: 650,
			essential: true,
		});
	};

	if (!map || !isLoaded) return null;
	return (
		<>
			{!expanded && zoom < 5.5 ? (
				<MapMarker
					longitude={optimalCenter ? LngLat.convert(optimalCenter).lng : 0}
					latitude={optimalCenter ? LngLat.convert(optimalCenter).lat : 0}
					onClick={handleClusterClick}
				>
					<MarkerContent>
						{/* <div className="flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-white shadow-lg cursor-pointer hover:bg-blue-700 transition">
							{name}
						</div> */}
						<motion.div whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.5 }}>
							<MapPin className="w-6 h-6" fill="green" />
						</motion.div>

						<MarkerTooltip>{name}</MarkerTooltip>
					</MarkerContent>
				</MapMarker>
			) : (
				visibleData.map((item, index) => (
					<MapMarker
						longitude={item.lng}
						latitude={item.lat}
						key={item.id ?? index}
						onClick={() => {
							setPhotoPlaceId(item.id ?? null);
						}}
						onDoubleClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							if (item.id === undefined) return;
							void navigate({
								to: "/places/$placeId",
								params: { placeId: String(item.id) },
							});
						}}
					>
						<MarkerContent>
							<motion.div
								initial={{ opacity: 0, scale: 0.6 }}
								animate={{ opacity: 1, scale: 1 }}
								transition={{
									duration: 0.3,
									ease: "easeInOut",
									delay: index * 0.003,
								}}
							>
								<motion.div
									className={`rounded-full ${turnStyle(item.category)} shadow-md cursor-pointer p-0.5`}
									whileHover={{ scale: 1.2 }}
									whileTap={{ scale: 0.9 }}
								>
									{turnIcon(item.category)}
								</motion.div>
							</motion.div>
							<MarkerPopup
								maxWidth="280px"
								className="w-70 max-w-[calc(100vw-2rem)] bg-popover p-3 text-left text-popover-foreground"
							>
								<div className="space-y-2 text-sm leading-relaxed">
									<div>
										<h3 className="font-semibold leading-tight">
											<ArabicPlaceName
												name={item.name}
												arabicName={item.arabicName}
											/>
										</h3>
										<p className="text-muted-foreground capitalize">
											{item.category}
										</p>
									</div>
									{item.id !== undefined && (
										<PlacePopupImages
											name={item.name}
											alternateNames={item.alternateNames}
											images={item.images}
											active={photoPlaceId === item.id}
										/>
									)}
									<PlaceMarkdown className="line-clamp-3">
										{item.description}
									</PlaceMarkdown>
									{item.id !== undefined && (
										<Link
											to="/places/$placeId"
											params={{ placeId: String(item.id) }}
											className="inline-flex text-sm font-medium text-amber-400 hover:text-amber-300"
											onClick={(event) => event.stopPropagation()}
										>
											View place details
										</Link>
									)}
								</div>
							</MarkerPopup>
							<MarkerTooltip>
								<ArabicPlaceName
									name={item.name}
									arabicName={item.arabicName}
								/>
							</MarkerTooltip>
						</MarkerContent>
					</MapMarker>
				))
			)}
		</>
	);
}

export default MapGenCluster;
