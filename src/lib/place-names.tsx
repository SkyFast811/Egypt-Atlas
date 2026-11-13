import { useEffect, useState } from "react";

type WikidataSearchResult = {
	id: string;
	label?: string;
	match?: {
		text?: string;
		type?: string;
	};
};

type WikidataEntity = {
	labels?: {
		ar?: { value?: string };
		arz?: { value?: string };
	};
	sitelinks?: {
		arwiki?: { title?: string };
	};
};

const arabicNameCache = new Map<string, Promise<string | null>>();

function normalizeName(value: string) {
	return value
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function getSearchPhrases(name: string) {
	const cleanedName = name.replace(/\s*\([^)]*\)/g, "").trim();
	const [mainName, context] = cleanedName.split(",", 2);

	return [
		...new Set(
			[cleanedName, mainName, context]
				.map((phrase) => phrase?.trim())
				.filter((phrase): phrase is string => !!phrase),
		),
	];
}

async function getArabicLabel(entityId: string): Promise<string | null> {
	const params = new URLSearchParams({
		action: "wbgetentities",
		ids: entityId,
		props: "labels|sitelinks",
		languages: "ar|arz",
		sites: "arwiki",
		format: "json",
		origin: "*",
	});
	const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`);
	if (!response.ok) throw new Error("Arabic place-name lookup failed.");

	const result = (await response.json()) as {
		entities?: Record<string, WikidataEntity>;
	};
	const entity = result.entities?.[entityId];

	return (
		entity?.labels?.ar?.value ??
		entity?.labels?.arz?.value ??
		entity?.sitelinks?.arwiki?.title ??
		null
	);
}

async function findArabicPlaceName(name: string): Promise<string | null> {
	const phrases = getSearchPhrases(name);
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
		const response = await fetch(
			`https://www.wikidata.org/w/api.php?${params}`,
		);
		if (!response.ok) throw new Error("Arabic place-name lookup failed.");

		const result = (await response.json()) as {
			search?: WikidataSearchResult[];
		};
		const normalizedPhrase = normalizeName(phrase);
		const match = result.search?.find(
			(item) =>
				(item.match?.type === "label" || item.match?.type === "alias") &&
				(item.match.text
					? normalizeName(item.match.text) === normalizedPhrase
					: item.label && normalizeName(item.label) === normalizedPhrase),
		);
		if (!match) continue;

		const arabicLabel = await getArabicLabel(match.id);
		if (arabicLabel) return arabicLabel;
	}

	return null;
}

export function getArabicPlaceName(name: string): Promise<string | null> {
	if (/[\u0600-\u06ff]/u.test(name)) return Promise.resolve(name);
	const cached = arabicNameCache.get(name);
	if (cached) return cached;

	const request = findArabicPlaceName(name).catch((error: unknown) => {
		arabicNameCache.delete(name);
		throw error;
	});
	arabicNameCache.set(name, request);
	return request;
}

export function useArabicPlaceName(name: string, lookupEnabled = true) {
	const [lookup, setLookup] = useState<{
		name: string;
		arabicName: string | null;
	} | null>(null);

	useEffect(() => {
		if (!lookupEnabled) return;
		let active = true;
		void getArabicPlaceName(name)
			.then((result) => {
				if (active) setLookup({ name, arabicName: result });
			})
			.catch(() => {
				if (active) setLookup({ name, arabicName: null });
			});
		return () => {
			active = false;
		};
	}, [name, lookupEnabled]);

	if (lookup?.name !== name) return "جارٍ تحميل الاسم العربي…";
	return lookup.arabicName ?? "لا يتوفر اسم عربي موثّق";
}

export function ArabicPlaceName({
	name,
	arabicName: storedArabicName,
}: {
	name: string;
	arabicName?: string | null;
}) {
	const resolvedArabicName = useArabicPlaceName(
		name,
		storedArabicName === undefined,
	);
	const arabicName =
		storedArabicName === undefined
			? resolvedArabicName
			: storedArabicName || "لا يتوفر اسم عربي موثّق";
	return (
		<span className="inline-flex flex-col leading-tight" dir="auto">
			<span lang="en" dir="auto" className="font-medium">
				{name}
			</span>
			<span
				lang="ar"
				dir="rtl"
				className="text-xs font-normal text-muted-foreground"
			>
				{arabicName}
			</span>
		</span>
	);
}
