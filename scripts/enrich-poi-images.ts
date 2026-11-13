import { Pool } from "pg";
import { findPlaceImages } from "../src/lib/place-media.ts";

type PoiRow = {
	id: number;
	name: string;
	alternate_names: string[];
	images: {
		url: string;
		alt: string;
		source?: string;
		credit?: string;
	}[];
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("DATABASE_URL must be set before enriching POI images");
}

const pool = new Pool({ connectionString: databaseUrl });
const concurrency = 2;
const progressInterval = 25;

async function main() {
	const { rows: pois } = await pool.query<PoiRow>(
		`SELECT id, name, alternate_names, images
		FROM egypt_pois
		ORDER BY id`,
	);
	const total = pois.length;
	const required = Math.ceil(total * 0.8);
	let completed = 0;
	let updated = 0;
	let failed = 0;
	let covered = pois.filter((poi) => poi.images.length >= 2).length;
	let cursor = 0;

	const enrichNext = async () => {
		while (cursor < pois.length && covered < required) {
			const poi = pois[cursor++];
			if (poi.images.length >= 2) {
				completed++;
				continue;
			}

			try {
				const missing = 2 - poi.images.length;
				const matches = await findPlaceImages(
					poi.name,
					missing,
					poi.alternate_names ?? [],
				);
				const seen = new Set(
					poi.images.map((image) => image.source ?? image.url),
				);
				const additions = matches.filter((image) => {
					const key = image.source ?? image.url;
					if (!image.url || !image.source || seen.has(key)) return false;
					seen.add(key);
					return true;
				});

				if (additions.length >= missing) {
					await pool.query(
						`UPDATE egypt_pois
						SET images = $1::jsonb
						WHERE id = $2`,
						[JSON.stringify([...poi.images, ...additions]), poi.id],
					);
					updated++;
					covered++;
				}
			} catch (error) {
				failed++;
				console.error(
					`Image lookup failed for "${poi.name}":`,
					error instanceof Error ? error.message : error,
				);
			}

			completed++;
			if (
				completed % progressInterval === 0 ||
				completed === pois.length ||
				covered >= required
			) {
				console.log(
					`Processed ${completed}/${pois.length}; updated ${updated}; lookup errors ${failed}.`,
				);
			}
		}
	};

	await Promise.all(
		Array.from({ length: concurrency }, () => enrichNext()),
	);

	const { rows } = await pool.query<{
		total: string;
		with_two_images: string;
	}>(
		`SELECT count(*) AS total,
			count(*) FILTER (WHERE jsonb_array_length(images) >= 2) AS with_two_images
		FROM egypt_pois`,
	);
	const finalTotal = Number(rows[0].total);
	const finalCovered = Number(rows[0].with_two_images);
	const finalRequired = Math.ceil(finalTotal * 0.8);
	console.log(
		`Final image coverage: ${finalCovered}/${finalTotal} POIs have at least two credited images; ${finalRequired} required (80%).`,
	);

	if (finalCovered < finalRequired) {
		throw new Error(
			`Image coverage is below the 80% target. ${finalTotal - finalCovered} POIs still need two images.`,
		);
	}
}

try {
	await main();
} finally {
	await pool.end();
}
