import { getRegion, regionForPoint } from './nz-regions';

export type PlaceAnchor = {
	name: string;
	regionId: string;
	lng: number;
	lat: number;
	kind: 'suburb' | 'town' | 'city' | 'district';
};

export type PlaceMatch = PlaceAnchor & {
	distanceKm: number;
	directionFromPlace: string;
};

const PLACE_ANCHORS: PlaceAnchor[] = [
	{ name: 'Auckland CBD', regionId: 'auckland', lng: 174.764, lat: -36.85, kind: 'suburb' },
	{ name: 'Newmarket', regionId: 'auckland', lng: 174.777, lat: -36.869, kind: 'suburb' },
	{ name: 'Parnell', regionId: 'auckland', lng: 174.783, lat: -36.855, kind: 'suburb' },
	{ name: 'Grey Lynn', regionId: 'auckland', lng: 174.733, lat: -36.858, kind: 'suburb' },
	{ name: 'Mount Albert', regionId: 'auckland', lng: 174.718, lat: -36.884, kind: 'suburb' },
	{ name: 'Avondale', regionId: 'auckland', lng: 174.696, lat: -36.895, kind: 'suburb' },
	{ name: 'Onehunga', regionId: 'auckland', lng: 174.785, lat: -36.923, kind: 'suburb' },
	{ name: 'Glen Innes', regionId: 'auckland', lng: 174.86, lat: -36.879, kind: 'suburb' },
	{ name: 'Howick', regionId: 'auckland', lng: 174.933, lat: -36.894, kind: 'suburb' },
	{ name: 'Botany', regionId: 'auckland', lng: 174.914, lat: -36.93, kind: 'suburb' },
	{ name: 'Manukau', regionId: 'auckland', lng: 174.879, lat: -36.992, kind: 'suburb' },
	{ name: 'Mount Eden', regionId: 'auckland', lng: 174.762, lat: -36.878, kind: 'suburb' },
	{ name: 'Ponsonby', regionId: 'auckland', lng: 174.743, lat: -36.848, kind: 'suburb' },
	{ name: 'Takapuna', regionId: 'auckland', lng: 174.775, lat: -36.787, kind: 'suburb' },
	{ name: 'Albany', regionId: 'auckland', lng: 174.699, lat: -36.728, kind: 'suburb' },
	{ name: 'Henderson', regionId: 'auckland', lng: 174.63, lat: -36.881, kind: 'suburb' },
	{ name: 'New Lynn', regionId: 'auckland', lng: 174.684, lat: -36.91, kind: 'suburb' },
	{ name: 'Takanini', regionId: 'auckland', lng: 174.914, lat: -37.049, kind: 'suburb' },
	{ name: 'Papakura', regionId: 'auckland', lng: 174.943, lat: -37.065, kind: 'suburb' },
	{ name: 'Orewa', regionId: 'auckland', lng: 174.696, lat: -36.586, kind: 'town' },
	{ name: 'Warkworth', regionId: 'auckland', lng: 174.663, lat: -36.398, kind: 'town' },
	{ name: 'Pukekohe', regionId: 'auckland', lng: 174.903, lat: -37.201, kind: 'town' },
	{ name: 'Wellington CBD', regionId: 'wellington', lng: 174.777, lat: -41.288, kind: 'suburb' },
	{ name: 'Te Aro', regionId: 'wellington', lng: 174.776, lat: -41.293, kind: 'suburb' },
	{ name: 'Newtown', regionId: 'wellington', lng: 174.779, lat: -41.311, kind: 'suburb' },
	{ name: 'Kilbirnie', regionId: 'wellington', lng: 174.794, lat: -41.319, kind: 'suburb' },
	{ name: 'Karori', regionId: 'wellington', lng: 174.737, lat: -41.284, kind: 'suburb' },
	{ name: 'Lower Hutt', regionId: 'wellington', lng: 174.911, lat: -41.212, kind: 'city' },
	{ name: 'Petone', regionId: 'wellington', lng: 174.879, lat: -41.228, kind: 'suburb' },
	{ name: 'Upper Hutt', regionId: 'wellington', lng: 175.071, lat: -41.124, kind: 'city' },
	{ name: 'Porirua', regionId: 'wellington', lng: 174.841, lat: -41.134, kind: 'city' },
	{ name: 'Paraparaumu', regionId: 'wellington', lng: 175.01, lat: -40.916, kind: 'town' },
	{ name: 'Johnsonville', regionId: 'wellington', lng: 174.8, lat: -41.222, kind: 'suburb' },
	{ name: 'Christchurch CBD', regionId: 'canterbury', lng: 172.636, lat: -43.532, kind: 'suburb' },
	{ name: 'Addington', regionId: 'canterbury', lng: 172.614, lat: -43.545, kind: 'suburb' },
	{ name: 'Sydenham', regionId: 'canterbury', lng: 172.641, lat: -43.547, kind: 'suburb' },
	{ name: 'Merivale', regionId: 'canterbury', lng: 172.625, lat: -43.51, kind: 'suburb' },
	{ name: 'Linwood', regionId: 'canterbury', lng: 172.674, lat: -43.532, kind: 'suburb' },
	{ name: 'New Brighton', regionId: 'canterbury', lng: 172.729, lat: -43.507, kind: 'suburb' },
	{ name: 'Riccarton', regionId: 'canterbury', lng: 172.598, lat: -43.53, kind: 'suburb' },
	{ name: 'Lyttelton', regionId: 'canterbury', lng: 172.72, lat: -43.603, kind: 'town' },
	{ name: 'Rolleston', regionId: 'canterbury', lng: 172.384, lat: -43.596, kind: 'town' },
	{ name: 'Rangiora', regionId: 'canterbury', lng: 172.595, lat: -43.304, kind: 'town' },
	{ name: 'Hamilton', regionId: 'waikato', lng: 175.279, lat: -37.787, kind: 'city' },
	{ name: 'Te Rapa', regionId: 'waikato', lng: 175.241, lat: -37.747, kind: 'suburb' },
	{ name: 'Chartwell', regionId: 'waikato', lng: 175.287, lat: -37.752, kind: 'suburb' },
	{ name: 'Cambridge', regionId: 'waikato', lng: 175.468, lat: -37.891, kind: 'town' },
	{ name: 'Te Awamutu', regionId: 'waikato', lng: 175.325, lat: -38.008, kind: 'town' },
	{ name: 'Taupō', regionId: 'waikato', lng: 176.07, lat: -38.686, kind: 'town' },
	{ name: 'Tauranga', regionId: 'bay-of-plenty', lng: 176.167, lat: -37.687, kind: 'city' },
	{ name: 'Mount Maunganui', regionId: 'bay-of-plenty', lng: 176.187, lat: -37.641, kind: 'suburb' },
	{ name: 'Pāpāmoa', regionId: 'bay-of-plenty', lng: 176.289, lat: -37.711, kind: 'suburb' },
	{ name: 'Whakatāne', regionId: 'bay-of-plenty', lng: 176.994, lat: -37.954, kind: 'town' },
	{ name: 'Rotorua', regionId: 'bay-of-plenty', lng: 176.249, lat: -38.136, kind: 'city' },
	{ name: 'Dunedin', regionId: 'otago', lng: 170.503, lat: -45.879, kind: 'city' },
	{ name: 'North Dunedin', regionId: 'otago', lng: 170.514, lat: -45.861, kind: 'suburb' },
	{ name: 'St Kilda', regionId: 'otago', lng: 170.51, lat: -45.902, kind: 'suburb' },
	{ name: 'Mosgiel', regionId: 'otago', lng: 170.347, lat: -45.875, kind: 'town' },
	{ name: 'Queenstown', regionId: 'otago', lng: 168.662, lat: -45.031, kind: 'town' },
	{ name: 'Frankton', regionId: 'otago', lng: 168.739, lat: -45.022, kind: 'suburb' },
	{ name: 'Wānaka', regionId: 'otago', lng: 169.136, lat: -44.696, kind: 'town' },
	{ name: 'Nelson', regionId: 'nelson', lng: 173.284, lat: -41.27, kind: 'city' },
	{ name: 'Richmond', regionId: 'tasman', lng: 173.183, lat: -41.339, kind: 'town' },
	{ name: 'Motueka', regionId: 'tasman', lng: 173.008, lat: -41.124, kind: 'town' },
	{ name: 'Napier', regionId: 'hawkes-bay', lng: 176.912, lat: -39.493, kind: 'city' },
	{ name: 'Hastings', regionId: 'hawkes-bay', lng: 176.844, lat: -39.638, kind: 'city' },
	{ name: 'Havelock North', regionId: 'hawkes-bay', lng: 176.879, lat: -39.67, kind: 'town' },
	{ name: 'New Plymouth', regionId: 'taranaki', lng: 174.075, lat: -39.055, kind: 'city' },
	{ name: 'Hāwera', regionId: 'taranaki', lng: 174.284, lat: -39.591, kind: 'town' },
	{ name: 'Palmerston North', regionId: 'manawatu-whanganui', lng: 175.611, lat: -40.356, kind: 'city' },
	{ name: 'Whanganui', regionId: 'manawatu-whanganui', lng: 175.053, lat: -39.93, kind: 'city' },
	{ name: 'Levin', regionId: 'manawatu-whanganui', lng: 175.284, lat: -40.622, kind: 'town' },
	{ name: 'Whangarei', regionId: 'northland', lng: 174.323, lat: -35.725, kind: 'city' },
	{ name: 'Kerikeri', regionId: 'northland', lng: 173.947, lat: -35.226, kind: 'town' },
	{ name: 'Kaitaia', regionId: 'northland', lng: 173.263, lat: -35.115, kind: 'town' },
	{ name: 'Gisborne', regionId: 'gisborne', lng: 178.018, lat: -38.662, kind: 'city' },
	{ name: 'Blenheim', regionId: 'marlborough', lng: 173.953, lat: -41.513, kind: 'town' },
	{ name: 'Picton', regionId: 'marlborough', lng: 174.006, lat: -41.29, kind: 'town' },
	{ name: 'Greymouth', regionId: 'west-coast', lng: 171.208, lat: -42.45, kind: 'town' },
	{ name: 'Hokitika', regionId: 'west-coast', lng: 170.968, lat: -42.718, kind: 'town' },
	{ name: 'Invercargill', regionId: 'southland', lng: 168.353, lat: -46.413, kind: 'city' }
];

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
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

function directionFromBearing(degrees: number) {
	const directions = ['north', 'north east', 'east', 'south east', 'south', 'south west', 'west', 'north west'];
	return directions[Math.round(degrees / 45) % directions.length];
}

function bearingDegrees(fromLat: number, fromLng: number, toLat: number, toLng: number) {
	const y = Math.sin(((toLng - fromLng) * Math.PI) / 180) * Math.cos((toLat * Math.PI) / 180);
	const x =
		Math.cos((fromLat * Math.PI) / 180) * Math.sin((toLat * Math.PI) / 180) -
		Math.sin((fromLat * Math.PI) / 180) *
			Math.cos((toLat * Math.PI) / 180) *
			Math.cos(((toLng - fromLng) * Math.PI) / 180);
	return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function nearestPlaces(lng: number, lat: number, limit = 3): PlaceMatch[] {
	return PLACE_ANCHORS.map((place) => ({
		...place,
		distanceKm: distanceKm(lat, lng, place.lat, place.lng),
		directionFromPlace: directionFromBearing(bearingDegrees(place.lat, place.lng, lat, lng))
	}))
		.sort((a, b) => a.distanceKm - b.distanceKm)
		.slice(0, limit);
}

export function nearestPlace(lng: number, lat: number): PlaceMatch | null {
	return nearestPlaces(lng, lat, 1)[0] ?? null;
}

function placeLabel(place: PlaceMatch | null, radiusKm: number) {
	if (!place) return null;
	if (place.distanceKm <= Math.max(1.2, radiusKm * 0.45)) return place.name;
	if (place.distanceKm <= Math.max(4, radiusKm * 0.8)) return `near ${place.name}`;
	return `${place.directionFromPlace} of ${place.name}`;
}

function capitalise(value: string) {
	return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function isQualifiedPlace(value: string) {
	return value.startsWith('near ') || value.includes(' of ');
}

function isDirectionalPlace(value: string) {
	return value.includes(' of ');
}

export function fallbackAreaLabel(lng: number, lat: number, radiusM: number): string {
	const regionId = regionForPoint(lng, lat);
	const region = getRegion(regionId);
	const place = nearestPlace(lng, lat);
	const radiusKm = radiusM / 1000;
	const base = placeLabel(place, radiusKm) ?? region?.name ?? 'this area';

	if (radiusKm <= 0.75) return isQualifiedPlace(base) ? capitalise(base) : `Around ${base}`;
	if (radiusKm <= 2) return isQualifiedPlace(base) ? capitalise(base) : `${base} streets`;
	if (radiusKm <= 6) {
		if (isDirectionalPlace(base)) return capitalise(base);
		return isQualifiedPlace(base) ? `${capitalise(base)} area` : `${base} neighbourhood`;
	}
	if (radiusKm <= 18) {
		if (isDirectionalPlace(base)) return capitalise(base);
		return isQualifiedPlace(base) ? `${capitalise(base)} district` : `${base} district`;
	}
	if (radiusKm <= 45) return `${region?.name ?? base} around ${place?.name ?? base}`;
	return `Wider ${region?.name ?? base} region`;
}
