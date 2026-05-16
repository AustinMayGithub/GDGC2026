<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onDestroy, onMount } from 'svelte';
	import type { Map, MapGeoJSONFeature, Popup } from 'maplibre-gl';
	import type { PostSummary } from '$lib/types';

	interface Props {
		posts: PostSummary[];
	}

	type CameraPreset = {
		id: string;
		label: string;
		center: [number, number];
		zoom: number;
		pitch: number;
		bearing: number;
	};

	let { posts }: Props = $props();

	let container: HTMLDivElement;
	let map: Map | null = null;
	let popup: Popup | null = null;
	let maplibre: typeof import('maplibre-gl') | null = null;
	let selectedPresetId = $state('auckland');

	const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
	const VECTOR_SOURCE_URL = 'https://tiles.openfreemap.org/planet';

	const presets: CameraPreset[] = [
		{
			id: 'auckland',
			label: 'Auckland',
			center: [174.766, -36.849],
			zoom: 14.8,
			pitch: 62,
			bearing: -24
		},
		{
			id: 'wellington',
			label: 'Wellington',
			center: [174.777, -41.289],
			zoom: 14.5,
			pitch: 60,
			bearing: 28
		},
		{
			id: 'christchurch',
			label: 'Christchurch',
			center: [172.636, -43.532],
			zoom: 14.5,
			pitch: 58,
			bearing: -18
		},
		{
			id: 'national',
			label: 'National',
			center: [173.7, -41.25],
			zoom: 5.05,
			pitch: 42,
			bearing: 0
		}
	];

	function toRadians(value: number) {
		return (value * Math.PI) / 180;
	}

	function buildCircle(
		centerLng: number,
		centerLat: number,
		radiusMeters: number,
		steps = 48
	): GeoJSON.Feature<GeoJSON.Polygon> {
		const coords: [number, number][] = [];
		const earthR = 6371000;
		const angularRadius = radiusMeters / earthR;
		const latR = toRadians(centerLat);
		const lngR = toRadians(centerLng);

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

	function engagementFor(post: PostSummary) {
		return post.commentCount * 4 + post.reactionCount * 3 + post.verifyCount * 2 + post.disputeCount;
	}

	function statusFor(post: PostSummary) {
		const total = post.verifyCount + post.disputeCount;
		if (total === 0) return 'unverified';
		const verified = post.verifyCount / total;
		if (verified >= 0.62) return 'verified';
		if (verified <= 0.38) return 'disputed';
		return 'mixed';
	}

	function postTowerFeatures(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
		const maxEngagement = Math.max(...posts.map(engagementFor), 1);
		return {
			type: 'FeatureCollection',
			features: posts.map((post) => {
				const engagement = engagementFor(post);
				const height = 70 + (engagement / maxEngagement) * 540;
				const radius = Math.min(Math.max(post.impactRadiusM * 0.06, 55), 240);
				return {
					...buildCircle(post.lng, post.lat, radius, 24),
					properties: {
						id: post.id,
						title: post.title,
						areaLabel: post.areaLabel,
						status: statusFor(post),
						height,
						base: 0,
						engagement
					}
				};
			})
		};
	}

	function impactFeatures(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
		return {
			type: 'FeatureCollection',
			features: posts.map((post) => ({
				...buildCircle(post.lng, post.lat, Math.min(post.impactRadiusM, 60000)),
				properties: {
					id: post.id,
					status: statusFor(post)
				}
			}))
		};
	}

	function syncPostData() {
		if (!map) return;
		(map.getSource('story-towers') as import('maplibre-gl').GeoJSONSource | undefined)?.setData(
			postTowerFeatures()
		);
		(map.getSource('impact-areas') as import('maplibre-gl').GeoJSONSource | undefined)?.setData(
			impactFeatures()
		);
	}

	function firstLabelLayerId() {
		const layers = map?.getStyle().layers ?? [];
		return layers.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field'])?.id;
	}

	function addBuildingExtrusions() {
		if (!map || map.getLayer('3d-buildings')) return;
		if (!map.getSource('openfreemap-3d')) {
			map.addSource('openfreemap-3d', {
				type: 'vector',
				url: VECTOR_SOURCE_URL
			});
		}

		map.addLayer(
			{
				id: '3d-buildings',
				source: 'openfreemap-3d',
				'source-layer': 'building',
				type: 'fill-extrusion',
				minzoom: 14,
				filter: ['!=', ['get', 'hide_3d'], true],
				paint: {
					'fill-extrusion-color': [
						'interpolate',
						['linear'],
						['coalesce', ['get', 'render_height'], 0],
						0,
						'#d7dce2',
						120,
						'#9eb7ca',
						320,
						'#6f90ad'
					],
					'fill-extrusion-height': [
						'interpolate',
						['linear'],
						['zoom'],
						14,
						0,
						16,
						['coalesce', ['get', 'render_height'], 12]
					],
					'fill-extrusion-base': [
						'case',
						['>=', ['zoom'], 16],
						['coalesce', ['get', 'render_min_height'], 0],
						0
					],
					'fill-extrusion-opacity': 0.72
				}
			},
			firstLabelLayerId()
		);
	}

	function addStoryLayers() {
		if (!map) return;
		const labelLayerId = firstLabelLayerId();
		const groundLayerId = map.getLayer('3d-buildings') ? '3d-buildings' : labelLayerId;
		map.addSource('impact-areas', { type: 'geojson', data: impactFeatures() });
		map.addSource('story-towers', { type: 'geojson', data: postTowerFeatures() });

		map.addLayer(
			{
				id: 'impact-area-fill',
				type: 'fill',
				source: 'impact-areas',
				paint: {
					'fill-color': [
						'match',
						['get', 'status'],
						'verified',
						'#16a34a',
						'disputed',
						'#dc2626',
						'mixed',
						'#d97706',
						'#111827'
					],
					'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.08, 12, 0.16]
				}
			},
			groundLayerId
		);
		map.addLayer(
			{
				id: 'impact-area-line',
				type: 'line',
				source: 'impact-areas',
				paint: {
					'line-color': '#111827',
					'line-opacity': 0.28,
					'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 14, 2.2]
				}
			},
			groundLayerId
		);
		map.addLayer(
			{
				id: 'story-towers',
				type: 'fill-extrusion',
				source: 'story-towers',
				paint: {
					'fill-extrusion-color': [
						'match',
						['get', 'status'],
						'verified',
						'#16a34a',
						'disputed',
						'#dc2626',
						'mixed',
						'#d97706',
						'#111827'
					],
					'fill-extrusion-height': ['get', 'height'],
					'fill-extrusion-base': ['get', 'base'],
					'fill-extrusion-opacity': 0.86,
					'fill-extrusion-vertical-gradient': true
				}
			},
			labelLayerId
		);
	}

	function showPopup(feature: MapGeoJSONFeature, lngLat: import('maplibre-gl').LngLatLike) {
		if (!map || !maplibre) return;
		popup?.remove();
		const title = String(feature.properties?.title ?? 'Story');
		const area = String(feature.properties?.areaLabel ?? 'Local area');
		const engagement = Number(feature.properties?.engagement ?? 0);
		const content = document.createElement('div');
		const heading = document.createElement('strong');
		const areaText = document.createElement('span');
		const engagementText = document.createElement('small');
		content.className = 'story-popup';
		heading.textContent = title;
		areaText.textContent = area;
		engagementText.textContent = `${engagement} engagement points`;
		content.append(heading, areaText, engagementText);
		popup = new maplibre.Popup({ closeButton: false, offset: 16 })
			.setLngLat(lngLat)
			.setDOMContent(content)
			.addTo(map);
	}

	function flyToPreset(preset: CameraPreset) {
		selectedPresetId = preset.id;
		map?.easeTo({
			center: preset.center,
			zoom: preset.zoom,
			pitch: preset.pitch,
			bearing: preset.bearing,
			duration: 850
		});
	}

	function fitNational() {
		const preset = presets.find((item) => item.id === 'national');
		if (preset) flyToPreset(preset);
	}

	onMount(async () => {
		maplibre = await import('maplibre-gl');
		const preset = presets[0];

		map = new maplibre.Map({
			container,
			style: STYLE_URL,
			center: preset.center,
			zoom: preset.zoom,
			pitch: preset.pitch,
			bearing: preset.bearing,
			attributionControl: false,
			canvasContextAttributes: { antialias: true }
		});

		map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-left');
		map.addControl(new maplibre.NavigationControl({ visualizePitch: true }), 'bottom-right');

		map.on('load', () => {
			if (!map) return;
			(map as unknown as { setLight?: (value: unknown) => void }).setLight?.({
				anchor: 'viewport',
				color: '#ffffff',
				intensity: 0.42,
				position: [1.2, 210, 45]
			});
			addBuildingExtrusions();
			addStoryLayers();

			map.on('mousemove', 'story-towers', (event) => {
				const feature = event.features?.[0];
				if (!feature || !event.lngLat) return;
				map!.getCanvas().style.cursor = 'pointer';
				showPopup(feature, event.lngLat);
			});
			map.on('mouseleave', 'story-towers', () => {
				if (!map) return;
				map.getCanvas().style.cursor = '';
				popup?.remove();
			});
		});
	});

	onDestroy(() => {
		popup?.remove();
		map?.remove();
	});

	$effect(() => {
		posts;
		syncPostData();
	});
</script>

<div class="scene">
	<div bind:this={container} class="map-container" data-testid="three-d-map"></div>

	<div class="toolbar" aria-label="3D map camera presets">
		{#each presets as preset}
			<button
				type="button"
				class:active={selectedPresetId === preset.id}
				onclick={() => (preset.id === 'national' ? fitNational() : flyToPreset(preset))}
			>
				{preset.label}
			</button>
		{/each}
	</div>

	<div class="legend" aria-label="3D story map legend">
		<span><i class="key verified"></i>Verified</span>
		<span><i class="key disputed"></i>Disputed</span>
		<span><i class="key mixed"></i>Mixed</span>
		<span><i class="key unverified"></i>Unverified</span>
	</div>
</div>

<style>
	.scene {
		position: relative;
		width: 100%;
		height: 100%;
		background: #dbe8ef;
		overflow: hidden;
	}

	.map-container {
		width: 100%;
		height: 100%;
	}

	.toolbar {
		position: absolute;
		top: 18px;
		left: 50%;
		z-index: 2;
		display: flex;
		transform: translateX(-50%);
		gap: 6px;
		padding: 6px;
		border: 1px solid rgba(255, 255, 255, 0.76);
		border-radius: var(--radius-lg);
		background: rgba(255, 255, 255, 0.82);
		backdrop-filter: blur(14px);
		box-shadow: 0 14px 32px rgba(15, 23, 42, 0.14);
	}

	.toolbar button {
		min-width: 86px;
		height: 34px;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-2);
		font-size: 13px;
		font-weight: 700;
	}

	.toolbar button:hover,
	.toolbar button.active {
		border-color: var(--border);
		background: #ffffff;
		color: var(--text);
	}

	.legend {
		position: absolute;
		left: 18px;
		bottom: 24px;
		z-index: 2;
		display: flex;
		flex-wrap: wrap;
		gap: 10px 14px;
		max-width: min(520px, calc(100vw - 36px));
		padding: 10px 12px;
		border: 1px solid rgba(255, 255, 255, 0.72);
		border-radius: var(--radius-lg);
		background: rgba(255, 255, 255, 0.86);
		backdrop-filter: blur(14px);
		box-shadow: 0 14px 32px rgba(15, 23, 42, 0.12);
		font-size: 12px;
		font-weight: 700;
		color: var(--text-2);
	}

	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.key {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		display: inline-block;
	}

	.verified {
		background: #16a34a;
	}

	.disputed {
		background: #dc2626;
	}

	.mixed {
		background: #d97706;
	}

	.unverified {
		background: #111827;
	}

	:global(.story-popup) {
		display: flex;
		flex-direction: column;
		gap: 3px;
		max-width: 230px;
		font: 12px/1.35 var(--font);
		color: var(--text);
	}

	:global(.story-popup strong) {
		font-size: 13px;
		line-height: 1.25;
	}

	:global(.story-popup span),
	:global(.story-popup small) {
		color: var(--text-2);
	}

	:global(.maplibregl-ctrl-bottom-right),
	:global(.maplibregl-ctrl-bottom-left) {
		margin: 0 18px 18px;
	}

	:global(.maplibregl-ctrl-group) {
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
	}

	@media (max-width: 760px) {
		.toolbar {
			left: 12px;
			right: 12px;
			transform: none;
			overflow-x: auto;
			justify-content: flex-start;
		}

		.toolbar button {
			min-width: 92px;
		}

		.legend {
			bottom: 18px;
		}
	}
</style>
