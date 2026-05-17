// Shared geo helpers - safe to import on both client and server.
// (Not under $lib/server, so the browser bundle can use them too.)

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two lng/lat points, in metres. */
export function haversineMeters(
	aLng: number,
	aLat: number,
	bLng: number,
	bLat: number
): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(bLat - aLat);
	const dLng = toRad(bLng - aLng);
	const lat1 = toRad(aLat);
	const lat2 = toRad(bLat);

	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * GPS readings are noisy, so a voter sitting just outside the line should not
 * be rejected by a few metres of drift. We forgive the device's reported
 * accuracy, capped so a wildly imprecise fix can't wave anyone through.
 */
export const MAX_ACCURACY_BUFFER_M = 250;

/** True when the voter is inside the impact zone, allowing for GPS error. */
export function isWithinRadius(
	postLng: number,
	postLat: number,
	radiusM: number,
	voterLng: number,
	voterLat: number,
	accuracyM = 0
): boolean {
	const distance = haversineMeters(postLng, postLat, voterLng, voterLat);
	const buffer = Math.min(Math.max(accuracyM, 0), MAX_ACCURACY_BUFFER_M);
	return distance <= radiusM + buffer;
}

/** Human-friendly distance string, e.g. "850 m" or "3.4 km". */
export function formatDistance(meters: number): string {
	if (meters >= 1000) {
		const km = meters / 1000;
		return `${km.toFixed(km >= 10 ? 0 : 1)} km`;
	}
	return `${Math.round(meters / 10) * 10} m`;
}

/**
 * Below this many located votes the heatmap stays hidden - with a single
 * point a "heatmap" plus exact-location reveal would simply dox that lone
 * voter (project.md §9.8).
 */
export const MIN_VOTES_FOR_HEATMAP = 2;
