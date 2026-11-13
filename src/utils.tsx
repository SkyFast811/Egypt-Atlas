import { BuildingIcon, LandmarkIcon, TreePineIcon } from "lucide-react";

export async function sleep(ms: number) {
	const promise = new Promise((resolve) => setTimeout(resolve, ms));
	return await promise;
}

export function turnStyle(
	name: "natural" | "modern human made" | "historic human made",
) {
	if (name === "natural") {
		return "bg-green-500";
	} else if (name === "historic human made") {
		return "bg-red-500";
	} else {
		return "bg-yellow-500";
	}
}

export function turnIcon(
	name: "natural" | "modern human made" | "historic human made",
) {
	if (name === "natural") {
		return <TreePineIcon className="text-white fill-white" size="13" />;
	} else if (name === "historic human made") {
		return <LandmarkIcon className="text-white fill-white" size="13" />;
	} else {
		return <BuildingIcon className="text-white fill-white" size="13" />;
	}
}
