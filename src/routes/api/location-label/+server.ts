import { json } from '@sveltejs/kit';
import { getRegion, regionForPoint } from '$lib/data/nz-regions';
import { nearestPlace } from '$lib/data/geo-labels';
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
	const place = nearestPlace(lng, lat);
	const label = await generateAreaLabel({
		lng,
		lat,
		radiusM,
		regionName: region?.name ?? 'New Zealand',
		nearestPlace: place?.name ?? region?.name ?? 'this area'
	});

	return json({ label });
};
