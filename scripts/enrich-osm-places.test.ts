import assert from "node:assert/strict";
import test from "node:test";
import { mergeImages } from "./enrich-osm-places.ts";

test("image enrichment deduplicates by source and keeps existing images first", () => {
	const existing = [
		{ url: "https://images.test/one.jpg", alt: "One", source: "commons:one" },
	];
	const additions = [
		{ url: "https://images.test/duplicate.jpg", alt: "Duplicate", source: "commons:one" },
		{ url: "https://images.test/two.jpg", alt: "Two", source: "commons:two" },
	];

	assert.deepEqual(mergeImages(existing, additions), [
		...existing,
		additions[1],
	]);
});

test("image enrichment caps the result and ignores invalid image URLs", () => {
	assert.deepEqual(
		mergeImages(
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
