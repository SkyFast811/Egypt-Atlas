import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { useMap } from "../ui/map";

function ReturnButtonLayer() {
	const { map, isLoaded } = useMap();
	const [zoom, setZoom] = useState(map?.getZoom() ?? 0);

	useEffect(() => {
		if (!map) return;
		const handleZoom = () => setZoom(map.getZoom());
		map.on("zoom", handleZoom);
		return () => {
			map.off("zoom", handleZoom);
		};
	}, [map]);

	if (!map || !isLoaded) return null;

	const handleClick = () => {
		map.flyTo({
			center: [31.0161, 27.0506],
			zoom: 4.9,
			essential: true,
			animate: true,
		});
	};

	return (
		<>
			{Math.abs(zoom - 4.9) > 0.1 && (
				<Button
					onClick={handleClick}
					variant="secondary"
					className="absolute top-3 left-3 z-20"
				>
					<RotateCw className="w-4 h-4 mr-2" />
					Return
				</Button>
			)}
		</>
	);
}

export default ReturnButtonLayer;
