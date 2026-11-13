import { config } from "dotenv";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";

export type Bounds = {
	south: number;
	west: number;
	north: number;
	east: number;
};

type OsmElement = {
	type: "node" | "way" | "relation";
	id: number;
	lat?: number;
	lon?: number;
	center?: { lat: number; lon: number };
	tags?: Record<string, string>;
};

type OsmResponse = {
	elements?: OsmElement[];
	remark?: string;
};

export type PlaceRecord = {
	osmId: string;
	name: string | null;
	category: string;
	latitude: number;
	longitude: number;
	city: string | null;
	phone: string | null;
	website: string | null;
};

export const IMPORT_BOUNDS: Bounds = {
	south: 22,
	west: 24.7,
	north: 31.6,
	east: 36.9,
};

export const IMPORT_REGIONS: Bounds[] = [
	{ south: 22, west: 24.7, north: 25.2, east: 28.77 },
	{ south: 22, west: 28.77, north: 25.2, east: 32.83 },
	{ south: 22, west: 32.83, north: 25.2, east: 36.9 },
	{ south: 25.2, west: 24.7, north: 28.4, east: 28.77 },
	{ south: 25.2, west: 28.77, north: 28.4, east: 32.83 },
	{ south: 25.2, west: 32.83, north: 28.4, east: 36.9 },
	{ south: 28.4, west: 24.7, north: 31.6, east: 28.77 },
	{ south: 28.4, west: 28.77, north: 31.6, east: 32.83 },
	{ south: 28.4, west: 32.83, north: 31.6, east: 36.9 },
];

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const POI_TAGS = [
	"amenity",
	"tourism",
	"shop",
	"leisure",
	"historic",
	"natural",
	"place",
	"man_made",
	"office",
	"craft",
	"healthcare",
	"sport",
	"public_transport",
	"railway",
	"aeroway",
] as const;
const MAX_ELEMENTS_PER_TILE = 5_000;
const MAX_TILE_DEPTH = 8;
const INSERT_BATCH_SIZE = 300;
const MIN_REQUEST_INTERVAL_MS = 1_100;
const MAX_REQUEST_ATTEMPTS = 4;

let lastRequestAt = 0;

class OverpassFetchError extends Error {
	constructor(
		message: string,
		readonly subdividable: boolean,
	) {
		super(message);
	}
}

export function buildOverpassQuery(bounds: Bounds): string {
	const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
	const selectors = POI_TAGS.map(
		(tag) => `nwr["name"]["${tag}"](${bbox});`,
	).join("\n");
	return `[out:json][timeout:180];\n(\n${selectors}\n);\nout center tags;`;
}

export function splitBounds(bounds: Bounds): Bounds[] {
	const midLatitude = (bounds.south + bounds.north) / 2;
	const midLongitude = (bounds.west + bounds.east) / 2;
	return [
		{
			south: bounds.south,
			west: bounds.west,
			north: midLatitude,
			east: midLongitude,
		},
		{
			south: bounds.south,
			west: midLongitude,
			north: midLatitude,
			east: bounds.east,
		},
		{
			south: midLatitude,
			west: bounds.west,
			north: bounds.north,
			east: midLongitude,
		},
		{
			south: midLatitude,
			west: midLongitude,
			north: bounds.north,
			east: bounds.east,
		},
	];
}

export function toPlaceRecord(element: OsmElement): PlaceRecord | null {
	const tags = element.tags;
	if (!tags) return null;

	const matchedTag = POI_TAGS.find((tag) => tags[tag]);
	if (!matchedTag) return null;

	const latitude = element.lat ?? element.center?.lat;
	const longitude = element.lon ?? element.center?.lon;
	const name = tags["name:en"] || tags.name || tags.official_name || null;
	if (
		!name ||
		latitude === undefined ||
		longitude === undefined ||
		!Number.isFinite(latitude) ||
		!Number.isFinite(longitude) ||
		latitude < IMPORT_BOUNDS.south ||
		latitude > IMPORT_BOUNDS.north ||
		longitude < IMPORT_BOUNDS.west ||
		longitude > IMPORT_BOUNDS.east
	) {
		return null;
	}

	const value = tags[matchedTag];
	const category =
		matchedTag === "shop"
			? `shop:${value}`
			: matchedTag === "amenity" &&
					["cafe", "restaurant", "fast_food", "food_court"].includes(value)
				? value === "cafe"
					? "cafe"
					: "restaurant"
				: matchedTag === "tourism" &&
						["hotel", "guest_house", "hostel", "motel", "apartment"].includes(
							value,
						)
					? "hotel"
					: `${matchedTag}:${value}`;

	return {
		osmId: `${element.type}/${element.id}`,
		name,
		category,
		latitude,
		longitude,
		city:
			tags["addr:city"] ||
			tags["addr:town"] ||
			tags["addr:village"] ||
			tags["addr:municipality"] ||
			null,
		phone: tags.phone || tags["contact:phone"] || null,
		website: tags.website || tags["contact:website"] || null,
	};
}

async function waitForRateLimit(): Promise<void> {
	const delay = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
	if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
	lastRequestAt = Date.now();
}

async function fetchTile(bounds: Bounds): Promise<OsmResponse> {
	for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt++) {
		await waitForRateLimit();
		try {
			const response = await fetch(OVERPASS_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					"User-Agent": "map-app-proj/1.0 (OpenStreetMap POI import)",
				},
				body: new URLSearchParams({ data: buildOverpassQuery(bounds) }),
				signal: AbortSignal.timeout(210_000),
			});
			const body = await response.text();
			if (!response.ok) {
				const message = `Overpass request failed (${response.status} ${response.statusText}): ${body.slice(0, 400)}`;
				const retryable = response.status === 429 || response.status >= 500;
				if (retryable && attempt + 1 < MAX_REQUEST_ATTEMPTS) {
					await new Promise((resolve) =>
						setTimeout(resolve, [2_000, 5_000, 12_000][attempt]),
					);
					continue;
				}
				throw new OverpassFetchError(message, response.status >= 500);
			}

			let result: OsmResponse;
			try {
				result = JSON.parse(body) as OsmResponse;
			} catch {
				throw new Error(`Overpass returned invalid JSON: ${body.slice(0, 400)}`);
			}
			if (!Array.isArray(result.elements)) {
				throw new Error("Overpass response is missing its elements array.");
			}
			return result;
		} catch (error) {
			if (error instanceof OverpassFetchError && !error.subdividable) {
				throw error;
			}
			const message = error instanceof Error ? error.message : String(error);
			if (attempt + 1 < MAX_REQUEST_ATTEMPTS) {
				await new Promise((resolve) =>
					setTimeout(resolve, [2_000, 5_000, 12_000][attempt]),
				);
				continue;
			}
			throw new OverpassFetchError(message, true);
		}
	}
	throw new Error("Overpass request attempts exhausted unexpectedly.");
}

async function insertPlaces(
	pool: Pool,
	records: PlaceRecord[],
): Promise<number> {
	let inserted = 0;
	for (let offset = 0; offset < records.length; offset += INSERT_BATCH_SIZE) {
		const batch = records.slice(offset, offset + INSERT_BATCH_SIZE);
		const values: unknown[] = [];
		const placeholders = batch.map((record, index) => {
			const start = index * 8;
			values.push(
				record.osmId,
				record.name,
				record.category,
				record.latitude,
				record.longitude,
				record.city,
				record.phone,
				record.website,
			);
			return `(${Array.from({ length: 8 }, (_, column) => `$${start + column + 1}`).join(", ")})`;
		});

		await pool.query(
			`INSERT INTO places
				(osm_id, name, category, latitude, longitude, city, phone, website)
			VALUES ${placeholders.join(", ")}
			ON CONFLICT (osm_id) DO UPDATE SET
				name = COALESCE(EXCLUDED.name, places.name),
				category = EXCLUDED.category,
				latitude = EXCLUDED.latitude,
				longitude = EXCLUDED.longitude,
				city = COALESCE(EXCLUDED.city, places.city),
				phone = COALESCE(EXCLUDED.phone, places.phone),
				website = COALESCE(EXCLUDED.website, places.website)`,
			values,
		);
		inserted += batch.length;
	}
	return inserted;
}

async function importBounds(
	pool: Pool,
	bounds: Bounds,
	depth: number,
	progress: { tiles: number; records: number },
): Promise<void> {
	let response: OsmResponse;
	try {
		response = await fetchTile(bounds);
	} catch (error) {
		if (!(error instanceof OverpassFetchError) || !error.subdividable) {
			throw error;
		}
		if (depth >= MAX_TILE_DEPTH) {
			throw new Error(
				`Overpass could not complete a tile at maximum depth ${MAX_TILE_DEPTH}: ${JSON.stringify(bounds)} (${error.message})`,
			);
		}
		for (const child of splitBounds(bounds)) {
			await importBounds(pool, child, depth + 1, progress);
		}
		return;
	}
	const needsSubdivision =
		Boolean(response.remark) ||
		(response.elements?.length ?? 0) > MAX_ELEMENTS_PER_TILE;

	if (needsSubdivision) {
		if (depth >= MAX_TILE_DEPTH) {
			throw new Error(
				`Could not fetch a complete tile at maximum depth ${MAX_TILE_DEPTH}: ${JSON.stringify(bounds)}${response.remark ? ` (${response.remark})` : ""}`,
			);
		}
		for (const child of splitBounds(bounds)) {
			await importBounds(pool, child, depth + 1, progress);
		}
		return;
	}

	const records = (response.elements ?? [])
		.map(toPlaceRecord)
		.filter((record): record is PlaceRecord => record !== null);
	progress.records += await insertPlaces(pool, records);
	progress.tiles++;
	if (progress.tiles % 10 === 0 || records.length > 0) {
		console.log(
			`Completed ${progress.tiles} tiles; imported or refreshed ${progress.records} OSM records.`,
		);
	}
}

async function main(): Promise<void> {
	config({ path: [".env.local", ".env"] });
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL must be set before importing OSM places");
	}

	const pool = new Pool({ connectionString: databaseUrl });
	try {
		await pool.query("SELECT 1");
		console.log(
			`Importing named OSM POIs within ${JSON.stringify(IMPORT_BOUNDS)}. Requests are sequential; dense or incomplete tiles are recursively subdivided.`,
		);
		const progress = { tiles: 0, records: 0 };
		for (const [index, region] of IMPORT_REGIONS.entries()) {
			console.log(`Fetching map region ${index + 1}/${IMPORT_REGIONS.length}.`);
			await importBounds(pool, region, 0, progress);
		}
		const { rows } = await pool.query<{ total: string }>(
			`SELECT count(*)::text AS total
			FROM places
			WHERE osm_id ~ '^(node|way|relation)/[0-9]+$'
				AND latitude BETWEEN $1 AND $2
				AND longitude BETWEEN $3 AND $4`,
			[
				IMPORT_BOUNDS.south,
				IMPORT_BOUNDS.north,
				IMPORT_BOUNDS.west,
				IMPORT_BOUNDS.east,
			],
		);
		console.log(
			`Import complete: ${progress.records} OSM records processed across ${progress.tiles} complete tiles; ${rows[0].total} OSM records are now stored inside the map bounds.`,
		);
		console.log(
			"OpenStreetMap does not publish a canonical total for this selection, so a percentage of all real-world locations cannot be verified.",
		);
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
