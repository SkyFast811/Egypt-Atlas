const knownNameVariations: Record<string, string[]> = {
	"great pyramid of giza khufu": [
		"Great Pyramid",
		"Pyramid of Khufu",
		"Pyramid of Cheops",
		"Cheops Pyramid",
		"الهرم الأكبر",
		"هرم خوفو",
	],
	"pyramid of khafre": ["Pyramid of Chephren", "Khafre Pyramid", "هرم خفرع"],
	"pyramid of menkaure": [
		"Pyramid of Mykerinos",
		"Menkaure Pyramid",
		"هرم منقرع",
	],
	"step pyramid of djoser saqqara": [
		"Djoser Pyramid",
		"Zoser Pyramid",
		"Step Pyramid of Zoser",
		"هرم زوسر",
	],
	"great sphinx of giza": [
		"Sphinx of Giza",
		"Great Sphinx",
		"Abu al-Hol",
		"أبو الهول",
	],
	"bent pyramid dahshur": [
		"Bent Pyramid",
		"Southern Shining Pyramid",
		"الهرم المنحني",
	],
	"red pyramid dahshur": ["Red Pyramid", "North Pyramid", "الهرم الأحمر"],
	"ruins of memphis mit rahina": ["Memphis", "Mit Rahina", "Hut-ka-Ptah"],
	"karnak temple complex luxor": [
		"Karnak",
		"Ipet-isut",
		"Ipet-Isut",
		"معبد الكرنك",
	],
	"luxor temple": ["Ipet-resyt", "Ipet Resyt", "معبد الأقصر"],
	"valley of the kings luxor": ["Biban el-Muluk", "Valley of Kings"],
	"philae temple complex agilkia island aswan": [
		"Philae Temple",
		"Temple of Isis at Philae",
		"معبد فيلة",
	],
	"philae temple of isis": [
		"Philae Temple",
		"Temple of Isis at Philae",
		"معبد فيلة",
	],
	"abu simbel temples ramesses ii nefertari": [
		"Abu Simbel",
		"Great Temple of Ramesses II",
		"Temple of Nefertari",
		"أبو سمبل",
	],
	"mount sinai jabal musa": [
		"Jabal Musa",
		"Mount Moses",
		"Gebel Musa",
		"جبل موسى",
		"جبل سيناء",
	],
	"saladin citadel of cairo": [
		"Cairo Citadel",
		"Citadel of Saladin",
		"قلعة صلاح الدين الأيوبي",
	],
	"citadel of qaitbay alexandria": [
		"Qaitbay Citadel",
		"Fort of Qaitbay",
		"قلعة قايتباي",
	],
	"temple of edfu horus temple": [
		"Edfu Temple",
		"Temple of Horus at Edfu",
		"معبد إدفو",
	],
	"temple of kom ombo sobek and haroeris": [
		"Kom Ombo Temple",
		"Temple of Sobek and Haroeris",
		"معبد كوم أمبو",
	],
};

export function normalizePlaceName(value: string) {
	return value
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLocaleLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()
		.replace(/\s+/g, " ");
}

export function getPlaceNameVariations(
	name: string,
	alternateNames: string[] = [],
) {
	const knownVariants = knownNameVariations[normalizePlaceName(name)] ?? [];
	const parentheticalName = name.match(/\(([^)]+)\)/)?.[1];
	const nameWithoutParentheses = name.replace(/\s*\([^)]*\)/g, "").trim();
	const commaPrefix = nameWithoutParentheses.split(",")[0]?.trim();

	return [
		...new Set(
			[
				name,
				...alternateNames,
				...knownVariants,
				parentheticalName,
				nameWithoutParentheses,
				commaPrefix,
			]
				.map((variant) => variant?.trim())
				.filter((variant): variant is string => !!variant),
		),
	];
}

export function matchesPlaceName(
	name: string,
	query: string,
	alternateNames: string[] = [],
) {
	const normalizedQuery = normalizePlaceName(query);
	if (!normalizedQuery) return false;

	const queryWords = normalizedQuery.split(" ");

	return getPlaceNameVariations(name, alternateNames).some((variant) => {
		const normalizedVariant = normalizePlaceName(variant);
		return (
			normalizedVariant.includes(normalizedQuery) ||
			queryWords.every((word) => normalizedVariant.includes(word))
		);
	});
}
