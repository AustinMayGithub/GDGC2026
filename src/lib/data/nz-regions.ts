// New Zealand's 16 regions, with approximate centroids and bounding boxes.
// Used for: local-mode map zoom, assigning a post to a region, and the
// manual region picker (project.md §8 — geolocation fallback).

export interface NzRegion {
	id: string;
	name: string;
	/** [lng, lat] */
	center: [number, number];
	/** [minLng, minLat, maxLng, maxLat] */
	bbox: [number, number, number, number];
}

export const NZ_REGIONS: NzRegion[] = [
	{ id: 'northland', name: 'Northland', center: [173.8, -35.4], bbox: [172.6, -36.6, 174.6, -34.3] },
	{ id: 'auckland', name: 'Auckland', center: [174.76, -36.85], bbox: [174.3, -37.3, 175.3, -36.1] },
	{ id: 'waikato', name: 'Waikato', center: [175.3, -37.9], bbox: [174.4, -39.0, 176.6, -36.7] },
	{ id: 'bay-of-plenty', name: 'Bay of Plenty', center: [176.8, -37.9], bbox: [175.8, -38.6, 178.0, -37.2] },
	{ id: 'gisborne', name: 'Gisborne', center: [177.9, -38.4], bbox: [177.0, -39.1, 178.6, -37.5] },
	{ id: 'hawkes-bay', name: "Hawke's Bay", center: [176.7, -39.5], bbox: [175.6, -40.5, 178.0, -38.8] },
	{ id: 'taranaki', name: 'Taranaki', center: [174.4, -39.3], bbox: [173.7, -39.8, 175.0, -38.6] },
	{
		id: 'manawatu-whanganui',
		name: 'Manawatū-Whanganui',
		center: [175.6, -39.8],
		bbox: [174.6, -40.6, 176.6, -38.8]
	},
	{ id: 'wellington', name: 'Wellington', center: [175.2, -41.1], bbox: [174.6, -41.6, 176.4, -40.4] },
	{ id: 'tasman', name: 'Tasman', center: [172.7, -41.4], bbox: [172.0, -42.2, 173.4, -40.5] },
	{ id: 'nelson', name: 'Nelson', center: [173.28, -41.27], bbox: [173.1, -41.4, 173.5, -41.1] },
	{ id: 'marlborough', name: 'Marlborough', center: [173.8, -41.7], bbox: [173.0, -42.5, 174.4, -40.9] },
	{ id: 'west-coast', name: 'West Coast', center: [170.6, -42.8], bbox: [168.2, -44.5, 172.3, -41.3] },
	{ id: 'canterbury', name: 'Canterbury', center: [171.8, -43.6], bbox: [169.6, -45.0, 174.2, -42.2] },
	{ id: 'otago', name: 'Otago', center: [169.9, -45.3], bbox: [167.6, -46.3, 171.5, -43.8] },
	{ id: 'southland', name: 'Southland', center: [167.9, -45.9], bbox: [166.4, -47.3, 169.5, -44.7] }
];

const REGION_BY_ID = new Map(NZ_REGIONS.map((r) => [r.id, r]));

export function getRegion(id: string): NzRegion | undefined {
	return REGION_BY_ID.get(id);
}

/** Approximate region for a point — nearest centroid. Good enough for NZ. */
export function regionForPoint(lng: number, lat: number): string {
	let best = NZ_REGIONS[0];
	let bestDist = Infinity;
	for (const r of NZ_REGIONS) {
		const dLng = (r.center[0] - lng) * Math.cos((lat * Math.PI) / 180);
		const dLat = r.center[1] - lat;
		const dist = dLng * dLng + dLat * dLat;
		if (dist < bestDist) {
			bestDist = dist;
			best = r;
		}
	}
	return best.id;
}

/** NZ-wide bounding box, for the national map view. */
export const NZ_BBOX: [number, number, number, number] = [166.0, -47.5, 178.8, -34.2];
