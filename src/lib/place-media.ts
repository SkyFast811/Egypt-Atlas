export type PlaceMediaImage = {
	url: string;
	alt: string;
	source?: string;
	credit?: string;
};

type CommonsPage = {
	title: string;
	imageinfo?: {
		thumburl?: string;
		descriptionurl?: string;
		mime?: string;
		extmetadata?: {
			Artist?: { value?: string };
			LicenseShortName?: { value?: string };
		};
	}[];
};

type EncyclopediaPage = {
	title: string;
	fullurl?: string;
	pageimage?: string;
};

const genericWords = new Set([
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
const imageSearchCache = new Map<string, Promise<PlaceMediaImage[]>>();
let nextApiRequestAt = 0;
let apiRequestQueue = Promise.resolve();

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

function fetchWikiApi(url: string) {
	const request = apiRequestQueue.then(async () => {
		for (let attempt = 0; attempt < 4; attempt++) {
			await sleep(Math.max(nextApiRequestAt - Date.now(), 0));
			nextApiRequestAt = Date.now() + 1000;
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
			if (response.status !== 429 && response.status < 500) return response;
			if (attempt === 3) return response;
			await sleep(getRetryDelay(response, attempt));
		}
		throw new Error("Wikimedia API request retries were exhausted.");
	});
	apiRequestQueue = request.then(
		() => undefined,
		() => undefined,
	);
	return request;
}

function termsFor(value: string) {
	return value
		.replace(/^File:/i, "")
		.replace(/\.[a-z0-9]{2,5}$/i, "")
		.replace(/\([^)]*\)/g, " ")
		.toLocaleLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((word) => word.length > 2 && !genericWords.has(word));
}

function stripMarkup(value: string | undefined) {
	return value
		?.replace(/<[^>]*>/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function scoreImageTitle(title: string, searchTerms: string[]) {
	const titleWords = new Set(termsFor(title));
	const matches = searchTerms.filter((word) => titleWords.has(word)).length;
	return {
		matches,
		coverage: matches / Math.max(searchTerms.length, 1),
	};
}

function searchPhrases(name: string) {
	const withoutParenthetical = name.replace(/\s*\([^)]*\)/g, "").trim();
	const primaryName = withoutParenthetical.split(",")[0]?.trim() ?? name;
	return [...new Set([`"${name}"`, `"${primaryName}"`, primaryName])];
}

async function searchCommons(
	phrase: string,
	searchName: string,
): Promise<PlaceMediaImage[]> {
	const cacheKey = `${phrase}|${searchName}`;
	const cached = imageSearchCache.get(cacheKey);
	if (cached) return cached;

	const params = new URLSearchParams({
		action: "query",
		generator: "search",
		gsrsearch: phrase,
		gsrnamespace: "6",
		gsrlimit: "100",
		prop: "imageinfo",
		iiprop: "url|mime|extmetadata",
		iiurlwidth: "960",
		format: "json",
		origin: "*",
	});
	const request = fetchWikiApi(
		`https://commons.wikimedia.org/w/api.php?${params}`,
	)
		.then((response) => {
			if (!response.ok) {
				throw new Error(`Wikimedia photo lookup failed (${response.status}).`);
			}
			return response.json() as Promise<{
				query?: { pages?: Record<string, CommonsPage> };
			}>;
		})
		.then((result) => {
			const relevantTerms = termsFor(searchName);
			const minimumMatches = Math.min(2, relevantTerms.length);
			return Object.values(result.query?.pages ?? {})
				.map((page) => {
					const image = page.imageinfo?.[0];
					const score = scoreImageTitle(page.title, relevantTerms);
					return { page, image, ...score };
				})
				.filter(
					({ image, matches, coverage }) =>
						image?.mime?.startsWith("image/") &&
						image.thumburl &&
						image.descriptionurl &&
						matches >= minimumMatches &&
						coverage >= 0.4,
				)
				.sort(
					(first, second) =>
						second.coverage - first.coverage || second.matches - first.matches,
				)
				.map(({ page, image }) => {
					const artist = stripMarkup(image?.extmetadata?.Artist?.value);
					const license = stripMarkup(
						image?.extmetadata?.LicenseShortName?.value,
					);
					return {
						url: image?.thumburl ?? "",
						alt: page.title,
						source: image?.descriptionurl ?? "",
						credit: [artist, license].filter(Boolean).join(" · ") || undefined,
					};
				});
		});

	imageSearchCache.set(cacheKey, request);
	try {
		return await request;
	} catch (error) {
		imageSearchCache.delete(cacheKey);
		throw error;
	}
}

async function searchArticleImages(name: string): Promise<PlaceMediaImage[]> {
	const searchParams = new URLSearchParams({
		action: "query",
		generator: "search",
		gsrsearch: name
			.replace(/\s*\([^)]*\)/g, "")
			.split(",")[0]
			.trim(),
		gsrnamespace: "0",
		gsrlimit: "10",
		prop: "pageimages|info",
		inprop: "url",
		piprop: "name",
		format: "json",
		origin: "*",
	});
	const searchResponse = await fetchWikiApi(
		`https://en.wikipedia.org/w/api.php?${searchParams}`,
	);
	if (!searchResponse.ok) {
		throw new Error(
			`Wikipedia image lookup failed (${searchResponse.status}).`,
		);
	}
	const searchResult = (await searchResponse.json()) as {
		query?: { pages?: Record<string, EncyclopediaPage> };
	};
	const terms = termsFor(name);
	const pages = Object.values(searchResult.query?.pages ?? {})
		.map((page) => ({ page, score: scoreImageTitle(page.title, terms) }))
		.filter(({ page, score }) => {
			const minimumMatches = Math.min(2, terms.length);
			return (
				Boolean(page.pageimage && page.fullurl) &&
				score.matches >= minimumMatches &&
				score.coverage >= 0.4
			);
		})
		.sort(
			(first, second) =>
				second.score.coverage - first.score.coverage ||
				second.score.matches - first.score.matches,
		)
		.map(({ page }) => page);
	if (pages.length === 0) return [];

	const fileParams = new URLSearchParams({
		action: "query",
		titles: pages.map((page) => `File:${page.pageimage}`).join("|"),
		prop: "imageinfo",
		iiprop: "url|mime|extmetadata",
		iiurlwidth: "960",
		format: "json",
		origin: "*",
	});
	const fileResponse = await fetchWikiApi(
		`https://commons.wikimedia.org/w/api.php?${fileParams}`,
	);
	if (!fileResponse.ok) {
		throw new Error(
			`Wikimedia article-photo attribution lookup failed (${fileResponse.status}).`,
		);
	}
	const fileResult = (await fileResponse.json()) as {
		query?: { pages?: Record<string, CommonsPage> };
	};
	return Object.values(fileResult.query?.pages ?? {}).flatMap((file) => {
		const image = file.imageinfo?.[0];
		const filename = file.title.replace(/^File:/i, "").replace(/_/g, " ");
		const article = pages.find(
			(page) =>
				page.pageimage?.replace(/_/g, " ").toLocaleLowerCase() ===
				filename.toLocaleLowerCase(),
		);
		if (
			!article?.fullurl ||
			!image?.thumburl ||
			!image.descriptionurl ||
			!image.mime?.startsWith("image/")
		) {
			return [];
		}
		const artist = stripMarkup(image.extmetadata?.Artist?.value);
		const license = stripMarkup(image.extmetadata?.LicenseShortName?.value);
		return [
			{
				url: image.thumburl,
				alt: file.title,
				source: image.descriptionurl,
				credit: [artist, license].filter(Boolean).join(" · ") || undefined,
			},
		];
	});
}

export async function findPlaceImages(
	name: string,
	limit: number,
	alternateNames: string[] = [],
): Promise<PlaceMediaImage[]> {
	const seen = new Set<string>();
	const images: PlaceMediaImage[] = [];
	const searchNames = [
		...new Set(
			[name, ...alternateNames].map((value) => value.trim()).filter(Boolean),
		),
	];
	for (const searchName of searchNames) {
		for (const phrase of searchPhrases(searchName)) {
			for (const image of await searchCommons(phrase, searchName)) {
				const key = image.source ?? image.url;
				if (seen.has(key)) continue;
				seen.add(key);
				images.push(image);
			}
			if (images.length >= limit) break;
		}
		if (images.length >= limit) break;
	}
	if (images.length < limit) {
		for (const image of await searchArticleImages(name)) {
			const key = image.source ?? image.url;
			if (seen.has(key)) continue;
			seen.add(key);
			images.push(image);
		}
	}

	return images.slice(0, limit);
}
