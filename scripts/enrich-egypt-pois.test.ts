import assert from "node:assert/strict";
import test from "node:test";
import {
	getEnrichedDescription,
	isRelevantImageMatch,
	isPlaceholderDescription,
	mapOpenverseImage,
	mergePoiImages,
	scoreNameMatch,
} from "./enrich-egypt-pois.ts";
import {
	hasSubstantivePoiData,
	shouldRemovePoi,
} from "./maintain-egypt-pois.ts";

test("image matching accepts one strong token from a multi-word place name", () => {
	assert.equal(
		isRelevantImageMatch(["Luxor Temple"], ["Luxor Temple Archaeological Site"]),
		true,
	);
	assert.equal(isRelevantImageMatch(["Cairo"], ["Cairo Citadel"]), true);
});

test("image matching scores against the best alternate name", () => {
	assert.deepEqual(
		scoreNameMatch(["Abu Simbel temples at sunset"], [
			"Ramses II Temple",
			"Abu Simbel (site)",
		]),
		{ matches: 2, coverage: 1 },
	);
	assert.equal(
		isRelevantImageMatch(["Mediterranean beach"], ["Abu Simbel Temple"]),
		false,
	);
});

test("Openverse images retain the source, creator, and license attribution", () => {
	assert.deepEqual(
		mapOpenverseImage(
			{
				title: "Luxor Temple",
				thumbnail: "https://images.test/luxor.jpg",
				foreign_landing_url: "https://photos.test/luxor",
				creator: "Photo author",
				license: "by-sa",
				license_version: "4.0",
				tags: [{ name: "Egypt" }],
			},
			"Luxor Temple",
		),
		{
			url: "https://images.test/luxor.jpg",
			alt: "Luxor Temple",
			source: "https://photos.test/luxor",
			credit: "Photo author · BY-SA 4.0",
		},
	);
});

test("Egypt POI images are deduplicated and existing images stay first", () => {
	const existing = [
		{ url: "https://images.test/one.jpg", alt: "One", source: "commons:one" },
	];
	const additions = [
		{ url: "https://images.test/duplicate.jpg", alt: "Duplicate", source: "commons:one" },
		{ url: "https://images.test/one.jpg", alt: "Same file", source: "openverse:one" },
		{ url: "https://images.test/two.jpg", alt: "Two", source: "commons:two" },
	];

	assert.deepEqual(mergePoiImages(existing, additions), [
		...existing,
		additions[2],
	]);
});

test("Egypt POI image merge enforces the limit and ignores empty URLs", () => {
	assert.deepEqual(
		mergePoiImages(
			[],
			[
				{ url: "https://images.test/one.jpg", alt: "One" },
				{ url: "", alt: "Invalid" },
				{ url: "https://images.test/two.jpg", alt: "Two" },
			],
			1,
		),
		[{ url: "https://images.test/one.jpg", alt: "One" }],
	);
});

test("generic descriptions can be replaced without overwriting authored content", () => {
	const summary = "A sufficiently long sourced description for this historic site.";
	assert.equal(
		isPlaceholderDescription(
			"Generic place to explore in Egypt, please check local context.",
		),
		true,
	);
	assert.equal(
		getEnrichedDescription(
			"Generic place to explore in Egypt, please check local context.",
			summary,
		),
		summary,
	);
	assert.equal(
		getEnrichedDescription("An authored description.", summary),
		"An authored description.",
	);
});

test("cleanup retains rows with usable images or specific information", () => {
	const base = {
		id: 1,
		name: "Example Site",
		arabicName: null,
		description: "",
		wikipediaSummary: "",
		historyNotes: "For Example Site, use on-site interpretation.",
		infoTips: [
			"Check current opening times, ticket rules before traveling.",
		],
		funActivities: ["Take a slow observation walk."],
		images: [],
	};
	assert.equal(shouldRemovePoi(base), true);
	assert.equal(
		shouldRemovePoi({
			...base,
			images: [{ url: "https://images.test/site.jpg" }],
		}),
		false,
	);
	assert.equal(
		hasSubstantivePoiData({
			...base,
			description:
				"This is a specific description with useful facts about the site.",
		}),
		true,
	);
	assert.equal(
		shouldRemovePoi({
			...base,
			images: [{ url: "file:///local/site.jpg" }],
		}),
		true,
	);
});
