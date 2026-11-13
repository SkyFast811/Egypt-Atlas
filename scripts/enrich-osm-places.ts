import { config } from "dotenv";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import {
	getWikipediaInformation,
	type PlaceInformation,
} from "../src/lib/place-information.ts";
import {
	findPlaceImages,
	type PlaceMediaImage,
} from "../src/lib/place-media.ts";

config({ path: [".env.local", ".env"] });

const IMAGE_LIMIT = 3;
const CONCURRENCY = 3;
const PROGRESS_INTERVAL = 25;

type PlaceRow = {
	id: number;
	name: string;
	latitude: string;
	longitude: string;
	description: string;
	wikipediaUrl: string | null;
	images: PlaceMediaImage[];
};

type Enrichment = {
	information: PlaceInformation | null;
	images: PlaceMediaImage[];
};

export function mergeImages(
	existing: PlaceMediaImage[],
	additions: PlaceMediaImage[],
	limit = IMAGE_LIMIT,
): PlaceMediaImage[] {
	const seen = new Set<string>();
	return [...existing, ...additions]
		.filter((image) => {
			if (!image.url) return false;
			const key = image.source || image.url;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.slice(0, limit);
}

export async function enrichPlace(place: PlaceRow): Promise<Enrichment> {
	const coordinates = {
		lat: Number(place.latitude),
		lng: Number(place.longitude),
	};
	if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) {
		throw new Error(`Place ${place.id} has invalid coordinates.`);
	}

	const [information, images] = await Promise.all([
		place.description.trim() && place.wikipediaUrl
			? Promise.resolve(null)
			: getWikipediaInformation(place.name, coordinates),
		place.images.length >= IMAGE_LIMIT
			? Promise.resolve([])
			: findPlaceImages(place.name, IMAGE_LIMIT - place.images.length),
	]);

	return { information, images };
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL must be set before enriching places");
	}

	const pool = new Pool({ connectionString: databaseUrl });
	try {
		await pool.query("SELECT 1");
		const { rows: places } = await pool.query<PlaceRow>(
			`SELECT id, name, latitude, longitude, description, wikipedia_url AS "wikipediaUrl", images
			FROM places
			WHERE name IS NOT NULL
				AND latitude IS NOT NULL
				AND longitude IS NOT NULL
				AND (
					description = ''
					OR wikipedia_url IS NULL
					OR jsonb_array_length(images) < $1
				)
			ORDER BY id`,
			[IMAGE_LIMIT],
		);
		console.log(`Enriching ${places.length} existing places.`);

		let cursor = 0;
		let completed = 0;
		let updated = 0;
		let failed = 0;

		const worker = async () => {
			while (cursor < places.length) {
				const place = places[cursor++];
				try {
					const { information, images } = await enrichPlace(place);
					const mergedImages = mergeImages(place.images, images);
					const description = information?.text.trim() ?? "";
					const wikipediaUrl = information?.url ?? null;

					if (
						description ||
						wikipediaUrl ||
						mergedImages.length !== place.images.length
					) {
						await pool.query(
							`UPDATE places
							SET description = CASE
									WHEN description = '' THEN $1
									ELSE description
								END,
								wikipedia_url = COALESCE(wikipedia_url, $2),
								images = $3::jsonb
							WHERE id = $4`,
							[
								description,
								wikipediaUrl,
								JSON.stringify(mergedImages),
								place.id,
							],
						);
						updated++;
					}
				} catch (error) {
					failed++;
					console.error(
						`Enrichment failed for place ${place.id} "${place.name}":`,
						error instanceof Error ? error.message : error,
					);
				}

				completed++;
				if (
					completed % PROGRESS_INTERVAL === 0 ||
					completed === places.length
				) {
					console.log(
						`Processed ${completed}/${places.length}; updated ${updated}; errors ${failed}.`,
					);
				}
			}
		};

		await Promise.all(
			Array.from({ length: Math.min(CONCURRENCY, places.length) }, worker),
		);

		const { rows } = await pool.query<{
			total: string;
			withDescription: string;
			withThreeImages: string;
		}>(
			`SELECT count(*)::text AS total,
				count(*) FILTER (WHERE description <> '')::text AS "withDescription",
				count(*) FILTER (WHERE jsonb_array_length(images) >= $1)::text AS "withThreeImages"
			FROM places
			WHERE name IS NOT NULL
				AND latitude IS NOT NULL
				AND longitude IS NOT NULL`,
			[IMAGE_LIMIT],
		);
		console.log(
			`Coverage: ${rows[0].withDescription}/${rows[0].total} descriptions; ${rows[0].withThreeImages}/${rows[0].total} places have at least ${IMAGE_LIMIT} images.`,
		);

		if (failed > 0) {
			throw new Error(`${failed} place enrichment lookups failed.`);
		}
	} finally {
		await pool.end();
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	await main();
}
