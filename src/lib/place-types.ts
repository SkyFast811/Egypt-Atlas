import type { PlaceMediaImage } from "./place-media";

export const PLACES_PAGE_SIZE = 2000;

export type Place = {
	id: number;
	name: string | null;
	category: string;
	latitude: string | number | null;
	longitude: string | number | null;
	city: string | null;
	description: string;
	wikipediaUrl: string | null;
	images: PlaceMediaImage[];
};
