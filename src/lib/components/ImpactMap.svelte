<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		lng: number;
		lat: number;
		radiusM: number;
		interactive?: boolean;
		onpick?: (lng: number, lat: number) => void;
	}

	let { lng, lat, radiusM, interactive = false, onpick }: Props = $props();

	let container: HTMLDivElement;
	let map: import('maplibre-gl').Map | null = null;
	let pinCoordinates = $state<[number, number]>([0, 0]);
	let hasLoaded = false;

	const OSM_STYLE = {
		version: 8 as const,
		sources: {
			osm: {
				type: 'raster' as const,
				tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
				tileSize: 256,
				attribution: '© OpenStreetMap contributors'
			}
		},
		layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }]
	};

	/** Build a GeoJSON circle polygon (64-point geodesic approximation). */
	function buildCircle(
		centerLng: number,
		centerLat: number,
		radiusMeters: number
	): GeoJSON.Feature<GeoJSON.Polygon> {
		const coords: [number, number][] = [];
		const steps = 64;
		const earthR = 6371000;
		const angularRadius = radiusMeters / earthR;
		const latR = (centerLat * Math.PI) / 180;
		const lngR = (centerLng * Math.PI) / 180;

		for (let i = 0; i <= steps; i++) {
			const bearing = (i / steps) * 2 * Math.PI;
			const pLat = Math.asin(
				Math.sin(latR) * Math.cos(angularRadius) +
				Math.cos(latR) * Math.sin(angularRadius) * Math.cos(bearing)
			);
			const pLng =
				lngR +
				Math.atan2(
					Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(latR),
					Math.cos(angularRadius) - Math.sin(latR) * Math.sin(pLat)
				);
			coords.push([(pLng * 180) / Math.PI, (pLat * 180) / Math.PI]);
		}

		return {
			type: 'Feature',
			geometry: { type: 'Polygon', coordinates: [coords] },
			properties: {}
		};
	}

	function updateCircle() {
		if (!map) return;
		const src = map.getSource('circle') as import('maplibre-gl').GeoJSONSource | undefined;
		if (src) {
			src.setData(buildCircle(lng, lat, radiusM));
		}
	}

	function updateMarker(newLng: number, newLat: number) {
		if (!map) return;
		const src = map.getSource('pin') as import('maplibre-gl').GeoJSONSource | undefined;
		if (src) {
			src.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [newLng, newLat] }, properties: {} });
		}
	}

	function fitToImpactZone(duration = 0, centerLng = lng, centerLat = lat) {
		if (!map) return;
		const feature = buildCircle(centerLng, centerLat, radiusM);
		const ring = feature.geometry.coordinates[0];

		let minLng = Infinity;
		let minLat = Infinity;
		let maxLng = -Infinity;
		let maxLat = -Infinity;

		for (const [pointLng, pointLat] of ring) {
			if (pointLng < minLng) minLng = pointLng;
			if (pointLng > maxLng) maxLng = pointLng;
			if (pointLat < minLat) minLat = pointLat;
			if (pointLat > maxLat) maxLat = pointLat;
		}

		map.fitBounds(
			[
				[minLng, minLat],
				[maxLng, maxLat]
			],
			{
				padding: 24,
				duration,
				maxZoom: 15
			}
		);
	}

	$effect(() => {
		// react to prop changes after mount
		if (!map) return;
		updateCircle();
		updateMarker(lng, lat);
		const nextCoordinates: [number, number] = [lng, lat];
		const movedPin =
			nextCoordinates[0] !== pinCoordinates[0] || nextCoordinates[1] !== pinCoordinates[1];
		pinCoordinates = nextCoordinates;
		fitToImpactZone(hasLoaded && movedPin ? 350 : 180, lng, lat);
	});

	onMount(async () => {
		const maplibre = (await import('maplibre-gl')).default;

		map = new maplibre.Map({
			container,
			style: OSM_STYLE,
			center: [lng, lat],
			zoom: radiusM > 20000 ? 9 : radiusM > 5000 ? 11 : 13,
			interactive
		});

		map.on('load', () => {
			if (!map) return;

			// Circle source + layers
			map.addSource('circle', { type: 'geojson', data: buildCircle(lng, lat, radiusM) });
			map.addLayer({
				id: 'circle-fill',
				type: 'fill',
				source: 'circle',
				paint: { 'fill-color': '#6366f1', 'fill-opacity': 0.15 }
			});
			map.addLayer({
				id: 'circle-line',
				type: 'line',
				source: 'circle',
				paint: { 'line-color': '#6366f1', 'line-width': 2, 'line-opacity': 0.7 }
			});

			// Pin marker source + layer
			map.addSource('pin', {
				type: 'geojson',
				data: { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} }
			});
			map.addLayer({
				id: 'pin-dot',
				type: 'circle',
				source: 'pin',
				paint: {
					'circle-radius': 7,
					'circle-color': '#6366f1',
					'circle-stroke-width': 2,
					'circle-stroke-color': '#fff'
				}
			});

			if (interactive && onpick) {
				map.on('click', (e) => {
					const { lng: clickLng, lat: clickLat } = e.lngLat;
					pinCoordinates = [clickLng, clickLat];
					updateMarker(clickLng, clickLat);
					// Update circle too
					const src = map!.getSource('circle') as import('maplibre-gl').GeoJSONSource;
					if (src) src.setData(buildCircle(clickLng, clickLat, radiusM));
					fitToImpactZone(350, clickLng, clickLat);
					onpick!(clickLng, clickLat);
				});
				map.getCanvas().style.cursor = 'crosshair';
			}

			hasLoaded = true;
			pinCoordinates = [lng, lat];
			fitToImpactZone(0);
		});
	});

	onDestroy(() => {
		map?.remove();
	});
</script>

<div class="map-wrap">
	<div bind:this={container} class="map-container"></div>
</div>

<style>
	.map-wrap {
		width: 100%;
		height: 100%;
		border-radius: var(--radius);
		overflow: hidden;
	}
	.map-container {
		width: 100%;
		height: 100%;
		filter: grayscale(1) contrast(1.05) brightness(1.04);
	}
</style>
