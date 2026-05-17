<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount, onDestroy } from 'svelte';
	import type { VotePoint } from '$lib/types';

	interface Props {
		lng: number;
		lat: number;
		radiusM: number;
		interactive?: boolean;
		onpick?: (lng: number, lat: number) => void;
		/**
		 * Located votes for the green/red heatmap overlay. When provided (even
		 * empty), the map runs in "article view" mode: pan/zoom enabled and
		 * clicking toggles the exact-location reveal.
		 */
		votePoints?: VotePoint[];
	}

	let { lng, lat, radiusM, interactive = false, onpick, votePoints }: Props = $props();

	const heatmapEnabled = $derived(votePoints !== undefined);
	const verifyPoints = $derived((votePoints ?? []).filter((p) => p.vote === 'verify'));
	const disputePoints = $derived((votePoints ?? []).filter((p) => p.vote === 'dispute'));
	const hasPoints = $derived((votePoints ?? []).length > 0);

	let container: HTMLDivElement;
	let map: import('maplibre-gl').Map | null = null;
	let maplibre: typeof import('maplibre-gl') | null = null;
	// Last prop values reflected on the map. Seeded properly in onMount's `load`
	// handler before any read (the $effect below is guarded on `hasLoaded`).
	let renderedLng = 0;
	let renderedLat = 0;
	let renderedRadiusM = 0;
	let hasLoaded = false;

	/** Reveal mode: false = show heatmaps, true = show exact voter points. */
	let revealed = $state(false);

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

	/** GeoJSON FeatureCollection of vote points for one vote type. */
	function pointsCollection(points: VotePoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
		return {
			type: 'FeatureCollection',
			features: points.map((p) => ({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
				properties: { vote: p.vote }
			}))
		};
	}

	function updateCircle(centerLng = lng, centerLat = lat, circleRadiusM = radiusM) {
		if (!map) return;
		const src = map.getSource('circle') as import('maplibre-gl').GeoJSONSource | undefined;
		if (src) {
			src.setData(buildCircle(centerLng, centerLat, circleRadiusM));
		}
	}

	function updateMarker(newLng: number, newLat: number) {
		if (!map) return;
		const src = map.getSource('pin') as import('maplibre-gl').GeoJSONSource | undefined;
		if (src) {
			src.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [newLng, newLat] }, properties: {} });
		}
	}

	/** Push the latest vote points into the heatmap + point sources. */
	function updateVotePoints() {
		if (!map) return;
		const verifySrc = map.getSource('verify-votes') as
			| import('maplibre-gl').GeoJSONSource
			| undefined;
		const disputeSrc = map.getSource('dispute-votes') as
			| import('maplibre-gl').GeoJSONSource
			| undefined;
		verifySrc?.setData(pointsCollection(verifyPoints));
		disputeSrc?.setData(pointsCollection(disputePoints));
	}

	/** Toggle between the heatmap view and the exact-points view. */
	function applyReveal() {
		if (!map) return;
		const vis = (on: boolean) => (on ? 'visible' : 'none');
		for (const id of ['verify-heat', 'dispute-heat']) {
			if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(!revealed));
		}
		for (const id of ['verify-points', 'dispute-points']) {
			if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(revealed));
		}
	}

	function fitToAffectedArea(
		duration = 0,
		centerLng = lng,
		centerLat = lat,
		circleRadiusM = radiusM
	) {
		if (!map) return;
		const feature = buildCircle(centerLng, centerLat, circleRadiusM);
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
		const currentLng = lng;
		const currentLat = lat;
		const currentRadiusM = radiusM;

		// React to prop changes after mount.
		if (!map || !hasLoaded) return;
		updateCircle(currentLng, currentLat, currentRadiusM);
		updateMarker(currentLng, currentLat);
		const movedPin = currentLng !== renderedLng || currentLat !== renderedLat;
		const changedRadius = currentRadiusM !== renderedRadiusM;
		renderedLng = currentLng;
		renderedLat = currentLat;
		renderedRadiusM = currentRadiusM;
		if (movedPin) {
			fitToAffectedArea(350, currentLng, currentLat, currentRadiusM);
		} else if (changedRadius) {
			fitToAffectedArea(0, currentLng, currentLat, currentRadiusM);
		}
	});

	// Refresh the heatmap whenever the vote points change (e.g. after a vote).
	$effect(() => {
		// Touch the derived values so the effect re-runs on change.
		void verifyPoints;
		void disputePoints;
		if (map && hasLoaded) updateVotePoints();
	});

	function showVotePopup(feature: import('maplibre-gl').MapGeoJSONFeature) {
		if (!map || !maplibre) return;
		const geom = feature.geometry;
		if (geom.type !== 'Point') return;
		const [pLng, pLat] = geom.coordinates as [number, number];
		const vote = feature.properties?.vote === 'dispute' ? 'dispute' : 'verify';
		const label = vote === 'verify' ? 'Verified here' : 'Marked untrue here';
		new maplibre.Popup({ closeButton: false, offset: 12 })
			.setLngLat([pLng, pLat])
			.setHTML(
				`<div class="vote-popup vote-popup-${vote}">` +
					`<span class="vote-popup-dot"></span>${label}` +
					`<div class="vote-popup-coords">${pLat.toFixed(5)}°, ${pLng.toFixed(5)}°</div>` +
				`</div>`
			)
			.addTo(map);
	}

	function handleMapClick(e: import('maplibre-gl').MapMouseEvent) {
		if (!map) return;
		// Interactive pin-picker mode (compose screen).
		if (interactive && onpick) {
			const { lng: clickLng, lat: clickLat } = e.lngLat;
			renderedLng = clickLng;
			renderedLat = clickLat;
			renderedRadiusM = radiusM;
			updateMarker(clickLng, clickLat);
			updateCircle(clickLng, clickLat, radiusM);
			fitToAffectedArea(350, clickLng, clickLat, radiusM);
			onpick(clickLng, clickLat);
			return;
		}

		// Heatmap mode (article view): click reveals / hides exact voter points.
		if (!heatmapEnabled || !hasPoints) return;
		const pointLayers = ['verify-points', 'dispute-points'].filter((id) => map!.getLayer(id));
		const hits = pointLayers.length
			? map.queryRenderedFeatures(e.point, { layers: pointLayers })
			: [];
		if (revealed && hits.length) {
			showVotePopup(hits[0]);
			return;
		}
		revealed = !revealed;
		applyReveal();
	}

	onMount(async () => {
		maplibre = await import('maplibre-gl');

		map = new maplibre.Map({
			container,
			style: OSM_STYLE,
			center: [lng, lat],
			zoom: radiusM > 20000 ? 9 : radiusM > 5000 ? 11 : 13,
			// Article view needs click events, so it must be interactive too.
			interactive: interactive || heatmapEnabled
		});

		// On the small article-view map, keep click/pan but don't let the wheel
		// hijack page scrolling.
		if (heatmapEnabled && !(interactive && onpick)) {
			map.scrollZoom.disable();
		}

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

			// Vote heatmap layers (green = verify, red = dispute).
			if (heatmapEnabled) {
				map.addSource('verify-votes', {
					type: 'geojson',
					data: pointsCollection(verifyPoints)
				});
				map.addSource('dispute-votes', {
					type: 'geojson',
					data: pointsCollection(disputePoints)
				});

				const heatRadius = [
					'interpolate', ['linear'], ['zoom'],
					8, 16, 13, 36, 18, 64
				];
				const heatIntensity = [
					'interpolate', ['linear'], ['zoom'],
					8, 1, 16, 2.2
				];

				map.addLayer({
					id: 'verify-heat',
					type: 'circle',
					source: 'verify-votes',
					paint: {
						'circle-radius': [
							'interpolate', ['linear'], ['zoom'],
							8, 16, 13, 30, 18, 52
						] as never,
						'circle-color': '#16a34a',
						'circle-opacity': [
							'interpolate', ['linear'], ['zoom'],
							8, 0.16, 13, 0.22, 18, 0.28
						] as never,
						'circle-blur': 0.88
					}
				});
				map.addLayer({
					id: 'dispute-heat',
					type: 'circle',
					source: 'dispute-votes',
					paint: {
						'circle-radius': [
							'interpolate', ['linear'], ['zoom'],
							8, 16, 13, 30, 18, 52
						] as never,
						'circle-color': '#991b1b',
						'circle-opacity': [
							'interpolate', ['linear'], ['zoom'],
							8, 0.2, 13, 0.27, 18, 0.34
						] as never,
						'circle-blur': 0.88
					}
				});
				map.addLayer({
					id: 'verify-heat-core',
					type: 'circle',
					source: 'verify-votes',
					paint: {
						'circle-radius': [
							'interpolate', ['linear'], ['zoom'],
							8, 7, 13, 11, 18, 18
						] as never,
						'circle-color': '#16a34a',
						'circle-opacity': 0.18,
						'circle-blur': 0.5
					}
				});
				map.addLayer({
					id: 'dispute-heat-core',
					type: 'circle',
					source: 'dispute-votes',
					paint: {
						'circle-radius': [
							'interpolate', ['linear'], ['zoom'],
							8, 7, 13, 11, 18, 18
						] as never,
						'circle-color': '#7f1d1d',
						'circle-opacity': 0.28,
						'circle-blur': 0.5
					}
				});

				// Exact-location point layers - hidden until the heatmap is clicked.
				map.addLayer({
					id: 'verify-points',
					type: 'circle',
					source: 'verify-votes',
					layout: { visibility: 'none' },
					paint: {
						'circle-radius': 6,
						'circle-color': '#16a34a',
						'circle-stroke-width': 2,
						'circle-stroke-color': '#ffffff'
					}
				});
				map.addLayer({
					id: 'dispute-points',
					type: 'circle',
					source: 'dispute-votes',
					layout: { visibility: 'none' },
					paint: {
						'circle-radius': 6,
						'circle-color': '#dc2626',
						'circle-stroke-width': 2,
						'circle-stroke-color': '#ffffff'
					}
				});

				for (const id of ['verify-points', 'dispute-points']) {
					map.on('mouseenter', id, () => {
						if (map) map.getCanvas().style.cursor = 'pointer';
					});
					map.on('mouseleave', id, () => {
						if (map) map.getCanvas().style.cursor = '';
					});
				}
			}

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
				map.getCanvas().style.cursor = 'crosshair';
			}
			if (interactive || heatmapEnabled) {
				map.on('click', handleMapClick);
			}

			hasLoaded = true;
			renderedLng = lng;
			renderedLat = lat;
			renderedRadiusM = radiusM;
			fitToAffectedArea(0, lng, lat, radiusM);
		});
	});

	onDestroy(() => {
		map?.remove();
	});
</script>

<div class="map-wrap">
	<div bind:this={container} class="map-container"></div>

	{#if heatmapEnabled && hasPoints}
		<!-- Legend + reveal hint -->
		<div class="vote-legend">
			<div class="legend-row">
				<span class="legend-key"><span class="swatch swatch-verify"></span>Verified</span>
				<span class="legend-key"><span class="swatch swatch-dispute"></span>Untrue</span>
			</div>
			<div class="legend-hint">
				{revealed ? 'Showing exact rater locations - click map for the heatmap' : 'Click the map to reveal exact rater locations'}
			</div>
		</div>
	{/if}
</div>

<style>
	.map-wrap {
		position: relative;
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

	/* Vote heatmap legend overlay */
	.vote-legend {
		position: absolute;
		left: 8px;
		bottom: 8px;
		z-index: 2;
		background: rgba(255, 255, 255, 0.92);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 6px 8px;
		font-size: 10px;
		line-height: 1.4;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
		pointer-events: none;
		max-width: 70%;
	}
	.legend-row {
		display: flex;
		gap: 10px;
		font-weight: 700;
	}
	.legend-key {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		display: inline-block;
	}
	.swatch-verify { background: #16a34a; }
	.swatch-dispute { background: #dc2626; }
	.legend-hint {
		margin-top: 3px;
		color: var(--text-3);
	}

	/* Popup styling (maplibre injects the markup, so target globally) */
	:global(.vote-popup) {
		font-size: 12px;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 5px;
		flex-wrap: wrap;
	}
	:global(.vote-popup-dot) {
		width: 9px;
		height: 9px;
		border-radius: 999px;
		display: inline-block;
	}
	:global(.vote-popup-verify .vote-popup-dot) { background: #16a34a; }
	:global(.vote-popup-dispute .vote-popup-dot) { background: #dc2626; }
	:global(.vote-popup-verify) { color: #15803d; }
	:global(.vote-popup-dispute) { color: #b91c1c; }
	:global(.vote-popup-coords) {
		width: 100%;
		font-weight: 500;
		font-family: monospace;
		color: #6b7280;
	}
</style>
