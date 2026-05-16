import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth';
import { NZ_BBOX } from '$lib/data/nz-regions';

/**
 * Derive a coarse visitor location from CDN-provided geo headers.
 *
 * Major hosts (Cloudflare, Vercel, Netlify, Fastly) attach the visitor's
 * approximate lat/lng to every request. Reading them is zero-latency and needs
 * no API key or external lookup — the perfect source for the *initial* map view
 * so it renders correctly before the browser geolocation prompt is answered.
 * Returns null when no header is present (e.g. local dev, plain Node host).
 */
function coarseLocationFromHeaders(headers: Headers): { lng: number; lat: number } | null {
	// Hosts that expose lat/lng as a pair of plain headers.
	const pairs: ReadonlyArray<readonly [lng: string, lat: string]> = [
		['x-vercel-ip-longitude', 'x-vercel-ip-latitude'],
		['cf-iplongitude', 'cf-iplatitude'],
		['x-geo-longitude', 'x-geo-latitude']
	];
	for (const [lngKey, latKey] of pairs) {
		const lng = Number(headers.get(lngKey));
		const lat = Number(headers.get(latKey));
		if (Number.isFinite(lng) && Number.isFinite(lat) && (lng !== 0 || lat !== 0)) {
			return { lng, lat };
		}
	}

	// Netlify ships geo as a base64-encoded JSON blob.
	const nfGeo = headers.get('x-nf-geo');
	if (nfGeo) {
		try {
			const json =
				typeof atob === 'function'
					? atob(nfGeo)
					: Buffer.from(nfGeo, 'base64').toString('utf8');
			const decoded = JSON.parse(json) as { longitude?: unknown; latitude?: unknown };
			const lng = Number(decoded.longitude);
			const lat = Number(decoded.latitude);
			if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
		} catch {
			// Malformed header — fall through to null.
		}
	}

	return null;
}

/**
 * Keep only locations that plausibly sit within New Zealand. An overseas
 * visitor's IP would otherwise centre the map on the wrong country; the manual
 * region picker (default Auckland) is the better fallback in that case.
 */
function withinNz(loc: { lng: number; lat: number }): boolean {
	const [minLng, minLat, maxLng, maxLat] = NZ_BBOX;
	return loc.lng >= minLng && loc.lng <= maxLng && loc.lat >= minLat && loc.lat <= maxLat;
}

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	try {
		event.locals.user = token ? await validateSession(token) : null;
	} catch (err) {
		console.warn('Session validation failed; continuing as a guest.', err);
		event.locals.user = null;
	}

	const coarse = coarseLocationFromHeaders(event.request.headers);
	event.locals.coarseLocation = coarse && withinNz(coarse) ? coarse : null;

	return resolve(event);
};
