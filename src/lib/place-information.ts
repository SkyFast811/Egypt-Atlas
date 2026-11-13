export type PlaceInformation = {
	title: string;
	url: string;
	text: string;
	source: "Wikipedia" | "Wikidata";
	matchType?: "nearby";
};

type WikipediaPage = {
	pageid: number;
	title: string;
	fullurl?: string;
	extract?: string;
};

type WikidataResult = {
	id: string;
	label?: string;
	description?: string;
	match?: {
		text?: string;
		type?: string;
	};
};

const ignoredWords = new Set([
	"ancient",
	"and",
	"area",
	"at",
	"city",
	"complex",
	"egypt",
	"egyptian",
	"for",
	"from",
	"historic",
	"human",
	"made",
	"national",
	"of",
	"place",
	"site",
	"the",
	"with",
]);

const wikipediaCache = new Map<string, Promise<PlaceInformation | null>>();
const wikidataCache = new Map<string, Promise<PlaceInformation | null>>();
let nextWikiRequestAt = 0;
let wikiRequestQueue = Promise.resolve();

function retryDelay(response: Response, attempt: number) {
	const retryAfter = response.headers.get("retry-after");
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds)) return seconds * 1000;
		const date = Date.parse(retryAfter);
		if (Number.isFinite(date)) return Math.max(date - Date.now(), 1000);
	}
	return Math.min(60_000, 2 ** attempt * 1000);
}

function fetchWikiApi(url: string) {
	const request = wikiRequestQueue.then(async () => {
		for (let attempt = 0; attempt < 4; attempt++) {
			await new Promise((resolve) =>
				setTimeout(resolve, Math.max(nextWikiRequestAt - Date.now(), 0)),
			);
			nextWikiRequestAt = Date.now() + 1000;

			let response: Response;
			try {
				response = await fetch(url, {
					headers: {
						"Api-User-Agent": "EgyptAtlas/1.0 (Egypt POI information catalog)",
					},
					signal: AbortSignal.timeout(30_000),
				});
			} catch (error) {
				if (attempt === 3) throw error;
				await new Promise((resolve) =>
					setTimeout(resolve, Math.min(60_000, 2 ** attempt * 1000)),
				);
				continue;
			}

			if (response.status !== 429 && response.status < 500) return response;
			if (attempt === 3) return response;
			await new Promise((resolve) =>
				setTimeout(resolve, retryDelay(response, attempt)),
			);
		}
		throw new Error("Wikipedia API request retries were exhausted.");
	});
	wikiRequestQueue = request.then(
		() => undefined,
		() => undefined,
	);
	return request;
}

function termsFor(value: string) {
	return value
		.replace(/\([^)]*\)/g, " ")
		.toLocaleLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 2 && !ignoredWords.has(word));
}

function similarity(title: string, searchTerms: string[]) {
	const titleTerms = new Set(termsFor(title));
	const matches = searchTerms.filter((term) => titleTerms.has(term)).length;
	return {
		matches,
		coverage: matches / Math.max(searchTerms.length, 1),
	};
}

function searchPhrases(name: string, alternateNames: string[] = []) {
	const cleaned = name.replace(/\s*\([^)]*\)/g, "").trim();
	const primary = cleaned.split(",")[0]?.trim() ?? cleaned;
	const words = primary.split(/\s+/);
	const suffixes = new Set([
		"archaeological",
		"area",
		"fortress",
		"monastery",
		"museum",
		"national",
		"park",
		"plateau",
		"protected",
		"site",
		"temple",
		"viewpoint",
	]);
	const withoutSuffix = words.filter(
		(word) => !suffixes.has(word.toLocaleLowerCase()),
	);
	const phraseVariants = [
		cleaned,
		primary,
		words.slice(1).join(" "),
		withoutSuffix.join(" "),
		...alternateNames
			.slice(0, 3)
			.map((alternateName) =>
				alternateName.replace(/\s*\([^)]*\)/g, "").trim(),
			),
	];
	return [
		...new Set(phraseVariants.map((phrase) => phrase.trim()).filter(Boolean)),
	];
}

function asWikipediaInformation(
	page: WikipediaPage | undefined,
): PlaceInformation | null {
	return page?.extract && page.fullurl
		? {
				title: page.title,
				url: page.fullurl,
				text: page.extract,
				source: "Wikipedia",
			}
		: null;
}

async function findWikipediaInformation(
	name: string,
	coordinates: { lat: number; lng: number },
	alternateNames: string[],
): Promise<PlaceInformation | null> {
	const names = [name, ...alternateNames.slice(0, 3)];
	const phrases = searchPhrases(name, alternateNames);
	const findBestMatch = (pages: WikipediaPage[], minimumCoverage: number) =>
		names
			.flatMap((searchName) => {
				const searchTerms = termsFor(searchName);
				return pages
					.filter((page) => page.pageid && page.fullurl && page.extract)
					.map((page) => ({
						page,
						...similarity(page.title, searchTerms),
					}))
					.filter(
						({ matches, coverage }) =>
							matches >= Math.min(1, searchTerms.length) &&
							coverage >= minimumCoverage,
					);
			})
			.sort(
				(first, second) =>
					second.coverage - first.coverage || second.matches - first.matches,
			)[0]?.page ?? null;

	for (const phrase of phrases) {
		const params = new URLSearchParams({
			action: "query",
			generator: "search",
			gsrsearch: phrase,
			gsrnamespace: "0",
			gsrlimit: "6",
			prop: "extracts|info",
			inprop: "url",
			exchars: "1200",
			explaintext: "1",
			format: "json",
			origin: "*",
		});
		const response = await fetchWikiApi(
			`https://en.wikipedia.org/w/api.php?${params}`,
		);
		if (!response.ok) throw new Error("Wikipedia place lookup failed.");
		const result = (await response.json()) as {
			query?: { pages?: Record<string, WikipediaPage> };
		};
		const match = findBestMatch(Object.values(result.query?.pages ?? {}), 0.3);
		if (match) return asWikipediaInformation(match);
	}

	const nearbyParams = new URLSearchParams({
		action: "query",
		generator: "geosearch",
		ggscoord: `${coordinates.lat}|${coordinates.lng}`,
		ggsradius: "25000",
		ggslimit: "30",
		prop: "extracts|info",
		inprop: "url",
		exchars: "1200",
		explaintext: "1",
		format: "json",
		origin: "*",
	});
	const nearbyResponse = await fetchWikiApi(
		`https://en.wikipedia.org/w/api.php?${nearbyParams}`,
	);
	if (!nearbyResponse.ok) {
		throw new Error("Nearby Wikipedia place lookup failed.");
	}
	const nearbyResult = (await nearbyResponse.json()) as {
		query?: { pages?: Record<string, WikipediaPage> };
	};
	const nearbyMatch = findBestMatch(
		Object.values(nearbyResult.query?.pages ?? {}),
		0.3,
	);
	const article = asWikipediaInformation(nearbyMatch);
	return article ? { ...article, matchType: "nearby" } : null;
}

async function findWikidataInformation(
	name: string,
): Promise<PlaceInformation | null> {
	const phrases = searchPhrases(name);
	const searchTerms = termsFor(name);
	for (const phrase of phrases) {
		const params = new URLSearchParams({
			action: "wbsearchentities",
			search: phrase,
			language: "en",
			uselang: "en",
			limit: "8",
			format: "json",
			origin: "*",
		});
		const response = await fetchWikiApi(
			`https://www.wikidata.org/w/api.php?${params}`,
		);
		if (!response.ok) throw new Error("Wikidata place lookup failed.");
		const result = (await response.json()) as {
			search?: WikidataResult[];
		};
		const match = (result.search ?? [])
			.filter((item) => item.label && item.description)
			.map((item) => ({ item, ...similarity(item.label ?? "", searchTerms) }))
			.filter(
				({ matches, coverage }) =>
					matches >= Math.min(1, searchTerms.length) && coverage >= 0.4,
			)
			.sort(
				(first, second) =>
					second.coverage - first.coverage || second.matches - first.matches,
			)[0]?.item;
		if (match?.label && match.description) {
			return {
				title: match.label,
				url: `https://www.wikidata.org/wiki/${match.id}`,
				text: match.description,
				source: "Wikidata",
			};
		}
	}
	return null;
}

export function getWikipediaInformation(
	name: string,
	coordinates: { lat: number; lng: number },
	alternateNames: string[] = [],
) {
	const cacheKey = `${name}|${coordinates.lat}|${coordinates.lng}|${alternateNames.join("|")}`;
	const cached = wikipediaCache.get(cacheKey);
	if (cached) return cached;
	const request = findWikipediaInformation(
		name,
		coordinates,
		alternateNames,
	).catch((error: unknown) => {
		wikipediaCache.delete(cacheKey);
		throw error;
	});
	wikipediaCache.set(cacheKey, request);
	return request;
}

export function getWikidataInformation(name: string) {
	const cached = wikidataCache.get(name);
	if (cached) return cached;
	const request = findWikidataInformation(name).catch((error: unknown) => {
		wikidataCache.delete(name);
		throw error;
	});
	wikidataCache.set(name, request);
	return request;
}
