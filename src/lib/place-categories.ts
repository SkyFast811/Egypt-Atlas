export const placeCategories = [
	{ id: "all", label: "All places" },
	{ id: "cafe", label: "Cafes" },
	{ id: "restaurant", label: "Restaurants" },
	{ id: "hotel", label: "Hotels" },
	{ id: "shop", label: "Shops" },
	{ id: "other", label: "Other" },
] as const;

export type PlaceCategory = (typeof placeCategories)[number]["id"];

export function getPlaceCategory(
	category: string,
): Exclude<PlaceCategory, "all"> {
	const normalizedCategory = category.toLowerCase();
	if (
		normalizedCategory.includes("cafe") ||
		normalizedCategory.includes("coffee")
	) {
		return "cafe";
	}
	if (
		normalizedCategory.includes("restaurant") ||
		normalizedCategory.includes("food") ||
		normalizedCategory.includes("dining")
	) {
		return "restaurant";
	}
	if (
		normalizedCategory.includes("hotel") ||
		normalizedCategory.includes("lodging") ||
		normalizedCategory.includes("hostel") ||
		normalizedCategory.includes("guest house")
	) {
		return "hotel";
	}
	if (
		normalizedCategory.includes("shop") ||
		normalizedCategory.includes("market") ||
		normalizedCategory.includes("store")
	) {
		return "shop";
	}
	return "other";
}
