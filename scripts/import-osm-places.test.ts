import assert from "node:assert/strict";
import test from "node:test";
import {
	buildOverpassQuery,
	IMPORT_BOUNDS,
	IMPORT_REGIONS,
	splitBounds,
	toPlaceRecord,
} from "./import-osm-places.ts";

test("Overpass query covers each supported named POI tag in the current map bounds", () => {
	const query = buildOverpassQuery(IMPORT_BOUNDS);
	assert.match(query, /nwr\["name"\]\["amenity"\]\(22,24\.7,31\.6,36\.9\)/);
	assert.match(query, /nwr\["name"\]\["shop"\]/);
	assert.match(query, /nwr\["name"\]\["historic"\]/);
	assert.match(query, /out center tags/);
});

test("recursive tile splits cover the input bounds without gaps", () => {
	const [southWest, southEast, northWest, northEast] =
		splitBounds(IMPORT_BOUNDS);
	const midLatitude = (IMPORT_BOUNDS.south + IMPORT_BOUNDS.north) / 2;
	const midLongitude = (IMPORT_BOUNDS.west + IMPORT_BOUNDS.east) / 2;
	assert.deepEqual(
		[southWest, southEast, northWest, northEast],
		[
			{
				south: IMPORT_BOUNDS.south,
				west: IMPORT_BOUNDS.west,
				north: midLatitude,
				east: midLongitude,
			},
			{
				south: IMPORT_BOUNDS.south,
				west: midLongitude,
				north: midLatitude,
				east: IMPORT_BOUNDS.east,
			},
			{
				south: midLatitude,
				west: IMPORT_BOUNDS.west,
				north: IMPORT_BOUNDS.north,
				east: midLongitude,
			},
			{
				south: midLatitude,
				west: midLongitude,
				north: IMPORT_BOUNDS.north,
				east: IMPORT_BOUNDS.east,
			},
		],
	);
});

test("the nine starting regions cover the current map bounds", () => {
	assert.equal(IMPORT_REGIONS.length, 9);
	assert.equal(
		Math.min(...IMPORT_REGIONS.map((region) => region.south)),
		IMPORT_BOUNDS.south,
	);
	assert.equal(
		Math.max(...IMPORT_REGIONS.map((region) => region.north)),
		IMPORT_BOUNDS.north,
	);
	assert.equal(
		Math.min(...IMPORT_REGIONS.map((region) => region.west)),
		IMPORT_BOUNDS.west,
	);
	assert.equal(
		Math.max(...IMPORT_REGIONS.map((region) => region.east)),
		IMPORT_BOUNDS.east,
	);
	assert.ok(IMPORT_REGIONS.every((region) => region.south < region.north));
	assert.ok(IMPORT_REGIONS.every((region) => region.west < region.east));
});

test("way centers and OSM tags map to the app's place fields", () => {
	assert.deepEqual(
		toPlaceRecord({
			type: "way",
			id: 42,
			center: { lat: 30.05, lon: 31.24 },
			tags: {
				name: "Example Cafe",
				amenity: "cafe",
				"addr:city": "Cairo",
				"contact:phone": "+20 2 0000",
				website: "https://example.test",
			},
		}),
		{
			osmId: "way/42",
			name: "Example Cafe",
			category: "cafe",
			latitude: 30.05,
			longitude: 31.24,
			city: "Cairo",
			phone: "+20 2 0000",
			website: "https://example.test",
		},
	);
});

test("unnamed, unsupported, or out-of-area elements are omitted", () => {
	assert.equal(
		toPlaceRecord({
			type: "node",
			id: 1,
			lat: 30,
			lon: 31,
			tags: { amenity: "cafe" },
		}),
		null,
	);
	assert.equal(
		toPlaceRecord({
			type: "node",
			id: 2,
			lat: 30,
			lon: 31,
			tags: { name: "Unnamed category" },
		}),
		null,
	);
	assert.equal(
		toPlaceRecord({
			type: "node",
			id: 3,
			lat: 32,
			lon: 31,
			tags: { name: "Outside area", amenity: "cafe" },
		}),
		null,
	);
});
