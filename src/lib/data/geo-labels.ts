import { getRegion, regionForPoint } from './nz-regions';

type PlaceAnchor = {
	name: string;
	regionId: string;
	lng: number;
	lat: number;
	kind: 'suburb' | 'town' | 'city' | 'district';
};

const PLACE_ANCHORS: PlaceAnchor[] = [
	{ name: 'Howick', regionId: 'auckland', lng: 174.933, lat: -36.894, kind: 'suburb' },
	{ name: 'Botany', regionId: 'auckland', lng: 174.914, lat: -36.93, kind: 'suburb' },
	{ name: 'Manukau', regionId: 'auckland', lng: 174.879, lat: -36.992, kind: 'suburb' },
	{ name: 'Mount Eden', regionId: 'auckland', lng: 174.762, lat: -36.878, kind: 'suburb' },
	{ name: 'Ponsonby', regionId: 'auckland', lng: 174.743, lat: -36.848, kind: 'suburb' },
	{ name: 'Takapuna', regionId: 'auckland', lng: 174.775, lat: -36.787, kind: 'suburb' },
	{ name: 'Albany', regionId: 'auckland', lng: 174.699, lat: -36.728, kind: 'suburb' },
	{ name: 'Henderson', regionId: 'auckland', lng: 174.63, lat: -36.881, kind: 'suburb' },
	{ name: 'New Lynn', regionId: 'auckland', lng: 174.684, lat: -36.91, kind: 'suburb' },
	{ name: 'Pukekohe', regionId: 'auckland', lng: 174.903, lat: -37.201, kind: 'town' },
	{ name: 'Wellington CBD', regionId: 'wellington', lng: 174.777, lat: -41.288, kind: 'suburb' },
	{ name: 'Lower Hutt', regionId: 'wellington', lng: 174.911, lat: -41.212, kind: 'city' },
	{ name: 'Porirua', regionId: 'wellington', lng: 174.841, lat: -41.134, kind: 'city' },
	{ name: 'Johnsonville', regionId: 'wellington', lng: 174.8, lat: -41.222, kind: 'suburb' },
	{ name: 'Christchurch CBD', regionId: 'canterbury', lng: 172.636, lat: -43.532, kind: 'suburb' },
	{ name: 'Riccarton', regionId: 'canterbury', lng: 172.598, lat: -43.53, kind: 'suburb' },
	{ name: 'Rangiora', regionId: 'canterbury', lng: 172.595, lat: -43.304, kind: 'town' },
	{ name: 'Hamilton', regionId: 'waikato', lng: 175.279, lat: -37.787, kind: 'city' },
	{ name: 'Cambridge', regionId: 'waikato', lng: 175.468, lat: -37.891, kind: 'town' },
	{ name: 'Tauranga', regionId: 'bay-of-plenty', lng: 176.167, lat: -37.687, kind: 'city' },
	{ name: 'Mount Maunganui', regionId: 'bay-of-plenty', lng: 176.187, lat: -37.641, kind: 'suburb' },
	{ name: 'Rotorua', regionId: 'bay-of-plenty', lng: 176.249, lat: -38.136, kind: 'city' },
	{ name: 'Dunedin', regionId: 'otago', lng: 170.503, lat: -45.879, kind: 'city' },
	{ name: 'Queenstown', regionId: 'otago', lng: 168.662, lat: -45.031, kind: 'town' },
	{ name: 'Nelson', regionId: 'nelson', lng: 173.284, lat: -41.27, kind: 'city' },
	{ name: 'Napier', regionId: 'hawkes-bay', lng: 176.912, lat: -39.493, kind: 'city' },
	{ name: 'New Plymouth', regionId: 'taranaki', lng: 174.075, lat: -39.055, kind: 'city' },
	{ name: 'Palmerston North', regionId: 'manawatu-whanganui', lng: 175.611, lat: -40.356, kind: 'city' },
	{ name: 'Whangarei', regionId: 'northland', lng: 174.323, lat: -35.725, kind: 'city' },
	{ name: 'Invercargill', regionId: 'southland', lng: 168.353, lat: -46.413, kind: 'city' }
];

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
	const earthRadiusKm = 6371;
	const latDelta = ((bLat - aLat) * Math.PI) / 180;
	const lngDelta = ((bLng - aLng) * Math.PI) / 180;
	const lat1 = (aLat * Math.PI) / 180;
	const lat2 = (bLat * Math.PI) / 180;
	const sinLat = Math.sin(latDelta / 2);
	const sinLng = Math.sin(lngDelta / 2);
	const haversine =
		sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
	return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function nearestPlace(lng: number, lat: number): PlaceAnchor | null {
	let best: PlaceAnchor | null = null;
	let bestDistance = Infinity;
	for (const place of PLACE_ANCHORS) {
		const distance = distanceKm(lat, lng, place.lat, place.lng);
		if (distance < bestDistance) {
			best = place;
			bestDistance = distance;
		}
	}
	return best;
}

export function fallbackAreaLabel(lng: number, lat: number, radiusM: number): string {
	const regionId = regionForPoint(lng, lat);
	const region = getRegion(regionId);
	const place = nearestPlace(lng, lat);
	const radiusKm = radiusM / 1000;
	const placeName = place?.name ?? region?.name ?? 'this area';

	if (radiusKm <= 1.5) return `Local ${placeName} area`;
	if (radiusKm <= 5) return `Wider ${placeName} area`;
	if (radiusKm <= 15) return `${placeName} local district`;
	if (radiusKm <= 40) return `${region?.name ?? placeName} regional area`;
	return `Wider ${region?.name ?? placeName} region`;
}
