import { Pool } from "pg";

const DEFAULT_LIBRETRANSLATE_URL = "https://translate.argosopentech.com";
const TRANSLATION_INTERVAL_MS = 1_000;
const PROGRESS_INTERVAL = 25;

type PlaceImage = {
	url?: string;
};

type PoiRecord = {
	id: number;
	name: string;
	arabicName: string | null;
	description: string;
	wikipediaSummary: string;
	historyNotes: string;
	infoTips: string[];
	funActivities: string[];
	images: PlaceImage[];
};

type TranslationResponse = {
	translatedText?: string;
};

const genericTips = [
	"Check current opening times, ticket rules",
	"Bring water, sun protection, and comfortable footwear",
	"Respect conservation boundaries and local customs",
];
const genericActivities = [
	"Take a slow observation walk",
	"Make a short photo or sketch journal",
	"Pair the visit with a nearby museum",
];
let nextTranslationAt = 0;

function sleep(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isValidImage(image: PlaceImage) {
	if (!image.url) return false;
	try {
		const url = new URL(image.url);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}

function isSubstantiveText(value: string, field: "description" | "history" | "summary") {
	const text = value.trim();
	if (text.length < 35 || /place to explore in egypt/i.test(text)) return false;
	if (
		field === "history" &&
		/^for .+ use on-site interpretation/i.test(text)
	) {
		return false;
	}
	return true;
}

function hasSpecificListItem(items: string[], genericItems: string[]) {
	return items.some(
		(item) =>
			item.trim().length >= 25 &&
			!genericItems.some((generic) =>
				item.toLocaleLowerCase().startsWith(generic.toLocaleLowerCase()),
			),
	);
}

export function hasSubstantivePoiData(poi: PoiRecord) {
	return (
		isSubstantiveText(poi.description, "description") ||
		isSubstantiveText(poi.wikipediaSummary, "summary") ||
		isSubstantiveText(poi.historyNotes, "history") ||
		hasSpecificListItem(poi.infoTips, genericTips) ||
		hasSpecificListItem(poi.funActivities, genericActivities)
	);
}

export function shouldRemovePoi(poi: PoiRecord) {
	return !poi.images.some(isValidImage) && !hasSubstantivePoiData(poi);
}

function getTranslationUrl() {
	const configuredUrl =
		process.env.LIBRETRANSLATE_URL ?? DEFAULT_LIBRETRANSLATE_URL;
	const url = new URL(configuredUrl);
	if (!url.pathname.endsWith("/translate")) {
		url.pathname = `${url.pathname.replace(/\/+$/, "")}/translate`;
	}
	return url;
}

function getRetryDelay(response: Response, attempt: number) {
	const retryAfter = response.headers.get("retry-after");
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds)) return Math.max(seconds * 1000, 1000);
		const date = Date.parse(retryAfter);
		if (Number.isFinite(date)) return Math.max(date - Date.now(), 1000);
	}
	return Math.min(30_000, 1000 * 2 ** attempt);
}

export async function translatePlaceName(name: string) {
	if (/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(name)) {
		return name.trim();
	}

	const url = getTranslationUrl();
	for (let attempt = 0; attempt < 4; attempt++) {
		await sleep(Math.max(nextTranslationAt - Date.now(), 0));
		nextTranslationAt = Date.now() + TRANSLATION_INTERVAL_MS;
		let response: Response;
		try {
			const body: { q: string; source: string; target: string; format: string; api_key?: string } = {
				q: name,
				source: "en",
				target: "ar",
				format: "text",
			};
			if (process.env.LIBRETRANSLATE_API_KEY) {
				body.api_key = process.env.LIBRETRANSLATE_API_KEY;
			}
			response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(20_000),
			});
		} catch (error) {
			if (attempt === 3) throw error;
			await sleep(Math.min(30_000, 1000 * 2 ** attempt));
			continue;
		}

		if ((response.status === 429 || response.status >= 500) && attempt < 3) {
			await sleep(getRetryDelay(response, attempt));
			continue;
		}
		if (!response.ok) {
			throw new Error(
				`LibreTranslate failed (${response.status} ${response.statusText}).`,
			);
		}

		const result = (await response.json()) as TranslationResponse;
		const translated = result.translatedText?.trim();
		if (
			!translated ||
			!/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(translated)
		) {
			throw new Error("LibreTranslate returned no valid Arabic translation.");
		}
		return translated;
	}
	throw new Error("LibreTranslate retries were exhausted.");
}

async function loadPois(pool: Pool) {
	const { rows } = await pool.query<PoiRecord>(
		`SELECT id, name, arabic_name AS "arabicName", description,
			wikipedia_summary AS "wikipediaSummary",
			history_notes AS "historyNotes", info_tips AS "infoTips",
			fun_activities AS "funActivities", images
		FROM egypt_pois
		ORDER BY id`,
	);
	return rows;
}

async function fillDescriptionsFromSummaries(pool: Pool) {
	const result = await pool.query(
		`UPDATE egypt_pois
		SET description = wikipedia_summary
		WHERE length(btrim(wikipedia_summary)) >= 35
			AND (
				btrim(description) = ''
				OR description ILIKE '%place to explore in Egypt%'
			)`,
	);
	return result.rowCount ?? 0;
}

async function translateMissingNames(pool: Pool, pois: PoiRecord[]) {
	const pending = pois.filter(
		(poi) => !poi.arabicName?.trim() && !shouldRemovePoi(poi),
	);
	let translated = 0;
	let failed = 0;
	let stopped = false;

	for (let index = 0; index < pending.length; index++) {
		const poi = pending[index];
		try {
			const arabicName = await translatePlaceName(poi.name);
			await pool.query(
				"UPDATE egypt_pois SET arabic_name = $1 WHERE id = $2 AND arabic_name IS NULL",
				[arabicName, poi.id],
			);
			translated++;
		} catch (error) {
			failed++;
			console.error(
				`Arabic name translation failed for POI ${poi.id} "${poi.name}":`,
				error instanceof Error ? error.message : error,
			);
			stopped = true;
			break;
		}

		if (
			translated % PROGRESS_INTERVAL === 0 ||
			index + 1 === pending.length
		) {
			console.log(
				`Translated ${index + 1}/${pending.length} names; successful translations ${translated}.`,
			);
		}
	}

	return {
		translated,
		failed,
		notAttempted: stopped ? pending.length - translated - failed : 0,
	};
}

async function removeInvalidEmptyPois(pool: Pool, dryRun: boolean) {
	if (dryRun) {
		const pois = await loadPois(pool);
		const removals = pois.filter(shouldRemovePoi);
		console.log(
			`Dry run: ${removals.length}/${pois.length} POIs have neither a usable image nor substantive place information.`,
		);
		for (const poi of removals.slice(0, 50)) {
			console.log(`Would remove ${poi.id}: ${poi.name}`);
		}
		if (removals.length > 50) {
			console.log(`...and ${removals.length - 50} additional POIs.`);
		}
		return removals.length;
	}

	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const { rows: pois } = await client.query<PoiRecord>(
			`SELECT id, name, arabic_name AS "arabicName", description,
				wikipedia_summary AS "wikipediaSummary",
				history_notes AS "historyNotes", info_tips AS "infoTips",
				fun_activities AS "funActivities", images
			FROM egypt_pois
			FOR UPDATE`,
		);
		const removals = pois.filter(shouldRemovePoi);
		if (removals.length > 0) {
			await client.query("DELETE FROM egypt_pois WHERE id = ANY($1::int[])", [
				removals.map((poi) => poi.id),
			]);
		}
		await client.query("COMMIT");
		console.log(
			`Removed ${removals.length} POIs with neither a usable image nor substantive place information.`,
		);
		return removals.length;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL must be set before maintaining Egypt POIs");
	}
	const dryRun = process.argv.includes("--dry-run");
	const pool = new Pool({ connectionString: databaseUrl });
	try {
		await pool.query("SELECT 1");
		const descriptionUpdates = dryRun
			? 0
			: await fillDescriptionsFromSummaries(pool);
		if (descriptionUpdates > 0) {
			console.log(
				`Replaced ${descriptionUpdates} empty or generic descriptions with stored Wikipedia summaries.`,
			);
		}

		const pois = await loadPois(pool);
		const removals = pois.filter(shouldRemovePoi);
		console.log(
			`Loaded ${pois.length} POIs; ${removals.length} currently meet the removal rule.`,
		);
		if (dryRun) {
			await removeInvalidEmptyPois(pool, true);
			return;
		}

		const translation = await translateMissingNames(pool, pois);
		console.log(
			`Arabic translations saved: ${translation.translated}; failed: ${translation.failed}; not attempted: ${translation.notAttempted}.`,
		);
		const deleted = await removeInvalidEmptyPois(pool, false);

		const { rows } = await pool.query<{
			total: string;
			withArabicName: string;
			withDescription: string;
			withImage: string;
		}>(
			`SELECT count(*)::text AS total,
				count(*) FILTER (WHERE nullif(btrim(arabic_name), '') IS NOT NULL)::text AS "withArabicName",
				count(*) FILTER (WHERE length(btrim(description)) >= 35)::text AS "withDescription",
				count(*) FILTER (WHERE EXISTS (
					SELECT 1 FROM jsonb_array_elements(images) image
					WHERE image->>'url' ~ '^https?://'
				))::text AS "withImage"
			FROM egypt_pois`,
		);
		console.log(
			`Final POIs: ${rows[0].total}; Arabic names ${rows[0].withArabicName}; substantive descriptions ${rows[0].withDescription}; with images ${rows[0].withImage}; removed ${deleted}.`,
		);

		if (translation.failed > 0 || translation.notAttempted > 0) {
			throw new Error(
				`Arabic translations are incomplete: ${translation.failed} failed and ${translation.notAttempted} were not attempted.`,
			);
		}
	} finally {
		await pool.end();
	}
}

if (process.argv[1]?.endsWith("maintain-egypt-pois.ts")) {
	await main();
}
