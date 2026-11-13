import { config } from "dotenv";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import {
	getWikipediaInformation,
	type PlaceInformation,
} from "../src/lib/place-information.ts";
import type { PlaceMediaImage } from "../src/lib/place-media.ts";

config({ path: [".env.local", ".env"] });

const IMAGE_LIMIT = 2;
const CONCURRENCY = 2;
const PROGRESS_INTERVAL = 25;
const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";
const OPENVERSE_API_URL = "https://api.openverse.org/v1/images/";
const OPENVERSE_REQUEST_INTERVAL = 3_100;
let nextCommonsRequestAt = 0;
let commonsRequestQueue = Promise.resolve();
let nextOpenverseRequestAt = 0;
let openverseRequestQueue = Promise.resolve();
let openverseUnavailable = false;
let openverseWarningLogged = false;

type CommonsSearchResponse = {
	query?: {
		pages?: Record<
			string,
			{
				title: string;
				imageinfo?: {
					url?: string;
					thumburl?: string;
					descriptionurl?: string;
					mime?: string;
					extmetadata?: {
						Artist?: { value?: string };
						LicenseShortName?: { value?: string };
					};
				}[];
			}
		>;
	};
};

type OpenverseImage = {
	title?: string;
	url?: string;
	thumbnail?: string;
	foreign_landing_url?: string;
	creator?: string;
	license?: string;
	license_version?: string;
	tags?: { name: string }[];
};

type OpenverseSearchResponse = {
	results?: OpenverseImage[];
};

type PoiRow = {
	id: number;
	name: string;
	alternateNames: string[];
	lat: number;
	lng: number;
	description: string;
	wikipediaSummary: string;
	wikipediaUrl: string | null;
	images: PlaceMediaImage[];
};

type Enrichment = {
	information: PlaceInformation | null;
	images: PlaceMediaImage[];
};

export function isPlaceholderDescription(description: string) {
	return /place to explore in egypt/i.test(description.trim());
}

export function getEnrichedDescription(
	description: string,
	summary: string,
) {
	return (!description.trim() || isPlaceholderDescription(description)) &&
		summary.trim()
		? summary.trim()
		: description;
}

function sleep(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getRetryDelay(response: Response, attempt: number) {
	const retryAfter = response.headers.get("retry-after");
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds)) return seconds * 1000;
		const date = Date.parse(retryAfter);
		if (Number.isFinite(date)) return Math.max(date - Date.now(), 1000);
	}
	return Math.min(60_000, 2 ** attempt * 1000);
}

function termsFor(value: string) {
	const ignoredTerms = new Set([
		"and",
		"area",
		"egypt",
		"egyptian",
		"for",
		"from",
		"national",
		"of",
		"the",
	]);
	return value
		.replace(/\([^)]*\)/g, " ")
		.toLocaleLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((term) => term.length > 2 && !ignoredTerms.has(term));
}

export function scoreNameMatch(values: string[], candidates: string[]) {
	const valueTerms = new Set(values.flatMap(termsFor));
	return candidates
		.map((candidate) => {
			const candidateTerms = [...new Set(termsFor(candidate))];
			const matches = candidateTerms.filter((term) =>
				valueTerms.has(term),
			).length;
			return {
				matches,
				coverage: matches / Math.max(candidateTerms.length, 1),
			};
		})
		.sort(
			(first, second) =>
				second.matches - first.matches || second.coverage - first.coverage,
		)[0] ?? { matches: 0, coverage: 0 };
}

export function isRelevantImageMatch(values: string[], candidates: string[]) {
	const score = scoreNameMatch(values, candidates);
	return score.matches >= 1 && score.coverage >= 0.25;
}

function fetchCommonsSearch(url: string) {
	const request = commonsRequestQueue.then(async () => {
		for (let attempt = 0; attempt < 4; attempt++) {
			await sleep(Math.max(nextCommonsRequestAt - Date.now(), 0));
			nextCommonsRequestAt = Date.now() + 1000;

			let response: Response;
			try {
				response = await fetch(url, {
					headers: {
						"Api-User-Agent": "EgyptAtlas/1.0 (Egypt POI photo catalog)",
					},
					signal: AbortSignal.timeout(30_000),
				});
			} catch (error) {
				if (attempt === 3) throw error;
				await sleep(Math.min(60_000, 2 ** attempt * 1000));
				continue;
			}

			if (response.status !== 429 && response.status < 500) {
				if (!response.ok) {
					throw new Error(
						`Wikimedia Commons search failed (${response.status} ${response.statusText}).`,
					);
				}
				return (await response.json()) as CommonsSearchResponse;
			}
			if (attempt === 3) {
				throw new Error(
					`Wikimedia Commons search failed (${response.status} ${response.statusText}).`,
				);
			}
			await sleep(getRetryDelay(response, attempt));
		}
		throw new Error("Wikimedia Commons search retries were exhausted.");
	});
	commonsRequestQueue = request.then(
		() => undefined,
		() => undefined,
	);
	return request;
}

async function findCommonsImages(
	name: string,
	limit: number,
	alternateNames: string[] = [],
): Promise<PlaceMediaImage[]> {
	if (limit <= 0) return [];
	const candidates = [...new Set([name, ...alternateNames].map((item) => item.trim()))]
		.filter(Boolean)
		.slice(0, 4);
	const images: PlaceMediaImage[] = [];
	const seen = new Set<string>();

	for (const candidate of candidates) {
		const params = new URLSearchParams({
			action: "query",
			generator: "search",
			gsrsearch: candidate,
			gsrnamespace: "6",
			gsrlimit: "50",
			prop: "imageinfo",
			iiprop: "url|mime|extmetadata",
			iiurlwidth: "960",
			format: "json",
		});
		const result = await fetchCommonsSearch(`${COMMONS_API_URL}?${params}`);
		const matches = Object.values(result.query?.pages ?? {})
			.map((page) => {
				const image = page.imageinfo?.[0];
				const score = scoreNameMatch(
					[page.title.replace(/^File:/i, "")],
					candidates,
				);
				return { page, image, ...score };
			})
			.filter(
				({ page, image }) =>
					image?.mime?.startsWith("image/") &&
					(image.thumburl || image.url) &&
					image.descriptionurl &&
					isRelevantImageMatch(
						[page.title.replace(/^File:/i, "")],
						candidates,
					),
			)
			.sort(
				(first, second) =>
					second.matches - first.matches || second.coverage - first.coverage,
			);

		for (const { page, image } of matches) {
			const source = image?.descriptionurl;
			const url = image?.thumburl ?? image?.url;
			if (!source || !url || seen.has(source)) continue;
			seen.add(source);
			const stripMarkup = (value: string | undefined) =>
				value?.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
			const artist = stripMarkup(image.extmetadata?.Artist?.value);
			const license = stripMarkup(image.extmetadata?.LicenseShortName?.value);
			images.push({
				url,
				alt: page.title,
				source,
				credit: [artist, license].filter(Boolean).join(" · ") || undefined,
			});
			if (images.length >= limit) return images;
		}
	}

	return images;
}

function fetchOpenverseSearch(url: string) {
	const request = openverseRequestQueue.then(async () => {
		if (openverseUnavailable) return null;
		await sleep(Math.max(nextOpenverseRequestAt - Date.now(), 0));
		nextOpenverseRequestAt = Date.now() + OPENVERSE_REQUEST_INTERVAL;

		for (let attempt = 0; attempt < 3; attempt++) {
			let response: Response;
			try {
				response = await fetch(url, {
					headers: { "User-Agent": "EgyptAtlas/1.0 (Egypt POI photo catalog)" },
					signal: AbortSignal.timeout(20_000),
				});
			} catch (error) {
				if (attempt === 2) throw error;
				await sleep(1000 * (attempt + 1));
				continue;
			}

			if (response.status === 429) {
				openverseUnavailable = true;
				if (!openverseWarningLogged) {
					openverseWarningLogged = true;
					console.warn(
						"Openverse rate limit reached; continuing with Wikimedia Commons only.",
					);
				}
				return null;
			}
			if (response.status >= 500 && attempt < 2) {
				await sleep(1000 * (attempt + 1));
				continue;
			}
			if (!response.ok) {
				throw new Error(
					`Openverse image search failed (${response.status} ${response.statusText}).`,
				);
			}
			return (await response.json()) as OpenverseSearchResponse;
		}
		throw new Error("Openverse image search retries were exhausted.");
	});
	openverseRequestQueue = request.then(
		() => undefined,
		() => undefined,
	);
	return request;
}

export function mapOpenverseImage(
	image: OpenverseImage,
	name: string,
	alternateNames: string[] = [],
): PlaceMediaImage | null {
	if (
		!image.thumbnail ||
		!image.foreign_landing_url ||
		!image.license ||
		!isRelevantImageMatch(
			[image.title ?? "", ...(image.tags ?? []).map((tag) => tag.name)],
			[name, ...alternateNames],
		)
	) {
		return null;
	}
	return {
		url: image.thumbnail,
		alt: image.title || name,
		source: image.foreign_landing_url,
		credit: [
			image.creator,
			`${image.license.toUpperCase()}${image.license_version ? ` ${image.license_version}` : ""}`,
		]
			.filter(Boolean)
			.join(" · "),
	};
}

async function findOpenverseImages(
	name: string,
	limit: number,
	alternateNames: string[],
): Promise<PlaceMediaImage[]> {
	if (limit <= 0 || openverseUnavailable) return [];
	const params = new URLSearchParams({
		q: name,
		page_size: "20",
		license_type: "all",
		mature: "false",
	});
	const result = await fetchOpenverseSearch(`${OPENVERSE_API_URL}?${params}`);
	if (!result) return [];
	return (result.results ?? [])
		.map((image) => mapOpenverseImage(image, name, alternateNames))
		.filter((image): image is PlaceMediaImage => image !== null)
		.slice(0, limit);
}

async function findPoiImages(poi: PoiRow, limit: number) {
	const commonsImages = await findCommonsImages(
		poi.name,
		limit,
		poi.alternateNames,
	);
	if (commonsImages.length >= limit) return commonsImages;
	try {
		const openverseImages = await findOpenverseImages(
			poi.name,
			limit - commonsImages.length,
			poi.alternateNames,
		);
		return [...commonsImages, ...openverseImages];
	} catch (error) {
		console.warn(
			`Openverse lookup failed for "${poi.name}"; keeping other image results:`,
			error instanceof Error ? error.message : error,
		);
		return commonsImages;
	}
}

export function mergePoiImages(
	existing: PlaceMediaImage[],
	additions: PlaceMediaImage[],
	limit = IMAGE_LIMIT,
): PlaceMediaImage[] {
	const seen = new Set<string>();
	return [...existing, ...additions]
		.filter((image) => {
			if (!image.url) return false;
			const keys = [image.source, image.url].filter(
				(key): key is string => Boolean(key),
			);
			if (keys.some((key) => seen.has(key))) return false;
			for (const key of keys) seen.add(key);
			return true;
		})
		.slice(0, limit);
}

export async function enrichPoi(poi: PoiRow): Promise<Enrichment> {
	const [information, images] = await Promise.all([
		poi.wikipediaSummary.trim() && poi.wikipediaUrl
			? Promise.resolve(null)
			: getWikipediaInformation(
					poi.name,
					{ lat: poi.lat, lng: poi.lng },
					poi.alternateNames,
				),
		poi.images.length >= IMAGE_LIMIT
			? Promise.resolve([])
			: findPoiImages(poi, IMAGE_LIMIT - poi.images.length),
	]);

	return { information, images };
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL must be set before enriching Egypt POIs");
	}

	const pool = new Pool({ connectionString: databaseUrl });
	try {
		await pool.query("SELECT 1");
		const { rows: pois } = await pool.query<PoiRow>(
			`SELECT id, name, alternate_names AS "alternateNames", lat, lng,
				description,
				wikipedia_summary AS "wikipediaSummary", wikipedia_url AS "wikipediaUrl",
				images
			FROM egypt_pois
			WHERE wikipedia_summary = ''
				OR wikipedia_url IS NULL
				OR jsonb_array_length(images) < $1
				OR description = ''
				OR description ILIKE '%place to explore in Egypt%'
			ORDER BY id`,
			[IMAGE_LIMIT],
		);
		console.log(`Enriching ${pois.length} Egypt POIs.`);

		let cursor = 0;
		let completed = 0;
		let updated = 0;
		let failed = 0;

		const worker = async () => {
			while (cursor < pois.length) {
				const poi = pois[cursor++];
				try {
					const { information, images } = await enrichPoi(poi);
					const mergedImages = mergePoiImages(poi.images, images);
					const summary = information?.text.trim() ?? "";
					const wikipediaUrl = information?.url ?? null;
					const description = getEnrichedDescription(
						poi.description,
						summary,
					);

					if (
						summary ||
						wikipediaUrl ||
						description !== poi.description ||
						mergedImages.length !== poi.images.length
					) {
						await pool.query(
							`UPDATE egypt_pois
							SET wikipedia_summary = CASE
									WHEN wikipedia_summary = '' THEN $1
									ELSE wikipedia_summary
								END,
								wikipedia_url = COALESCE(wikipedia_url, $2),
								images = $3::jsonb,
								description = $5
							WHERE id = $4`,
							[
								summary,
								wikipediaUrl,
								JSON.stringify(mergedImages),
								poi.id,
								description,
							],
						);
						updated++;
					}
				} catch (error) {
					failed++;
					console.error(
						`Enrichment failed for Egypt POI ${poi.id} "${poi.name}":`,
						error instanceof Error ? error.message : error,
					);
				}

				completed++;
				if (
					completed % PROGRESS_INTERVAL === 0 ||
					completed === pois.length
				) {
					console.log(
						`Processed ${completed}/${pois.length}; updated ${updated}; errors ${failed}.`,
					);
				}
			}
		};

		await Promise.all(
			Array.from({ length: Math.min(CONCURRENCY, pois.length) }, worker),
		);

		const { rows } = await pool.query<{
			total: string;
			withSummary: string;
			withTwoImages: string;
		}>(
			`SELECT count(*)::text AS total,
				count(*) FILTER (WHERE wikipedia_summary <> '')::text AS "withSummary",
				count(*) FILTER (WHERE jsonb_array_length(images) >= $1)::text AS "withTwoImages"
			FROM egypt_pois`,
			[IMAGE_LIMIT],
		);
		console.log(
			`Coverage: ${rows[0].withSummary}/${rows[0].total} Wikipedia summaries; ${rows[0].withTwoImages}/${rows[0].total} POIs have at least ${IMAGE_LIMIT} credited images.`,
		);

		if (failed > 0) {
			throw new Error(`${failed} Egypt POI enrichment lookups failed.`);
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
