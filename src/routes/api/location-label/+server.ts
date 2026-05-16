import { json } from '@sveltejs/kit';
import { getRegion, regionForPoint } from '$lib/data/nz-regions';
import { nearestPlaces } from '$lib/data/geo-labels';
import { generateAreaLabel } from '$lib/server/ai';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const lng = Number(url.searchParams.get('lng'));
	const lat = Number(url.searchParams.get('lat'));
	const radiusM = Math.round(Number(url.searchParams.get('radiusM')));

	if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(radiusM)) {
		return json({ label: 'Selected local area' });
	}

	const region = getRegion(regionForPoint(lng, lat));
	const places = nearestPlaces(lng, lat, 4);
	const place = places[0];
	const label = await generateAreaLabel({
		lng,
		lat,
		radiusM,
		regionName: region?.name ?? 'New Zealand',
		nearestPlace: place?.name ?? region?.name ?? 'this area',
		nearestPlaceKind: place?.kind,
		nearestPlaceDistanceKm: place?.distanceKm,
		nearestPlaceDirection: place?.directionFromPlace,
		nearbyPlaces: places.slice(1).map((nearby) => nearby.name)
	});

	return json({ label });
};
