<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount, onDestroy } from 'svelte';
	import type { PostSummary } from '$lib/types';
	import { NZ_BBOX } from '$lib/data/nz-regions';
	import type { StyleSpecification } from 'maplibre-gl';

	interface Props {
		posts: PostSummary[];
		hoveredPostId: string | null;
		selectedPostId: string | null;
		disableSelection?: boolean;
		onMapReady: (map: unknown) => void;
		onMarkerPositionsChange: () => void;
		onSelectPost: (id: string | null) => void;
	}

	type CameraOptions = {
		center?: [number, number];
		zoom?: number;
		duration?: number;
	};

	type MapViewportState = {
		centerLng: number;
		centerLat: number;
		zoom: number;
		bounds: [number, number, number, number];
	};

	let {
		posts,
		hoveredPostId,
		selectedPostId,
		disableSelection = false,
		onMapReady,
		onMarkerPositionsChange,
		onSelectPost
	}: Props = $props();

	let container: HTMLDivElement;
	let map: unknown = null;
	let maplibre: typeof import('maplibre-gl') | null = null;

	const NZ_VISUAL_CENTER: [number, number] = [174.25, -41.15];
	const EMPTY_FEATURES: GeoJSON.FeatureCollection = {
		type: 'FeatureCollection',
		features: []
	};

	const BASEMAP_STYLE = {
		version: 8 as const,
		sources: {
			basemap: {
				type: 'vector' as const,
				url: 'https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json',
				attribution: 'OpenStreetMap contributors, CARTO'
			}
		},
		layers: [
			{
				id: 'land',
				type: 'background' as const,
				paint: {
					'background-color': '#c7ffab'
				}
			},
			{
				id: 'landcover',
				type: 'fill' as const,
				source: 'basemap',
				'source-layer': 'landcover',
				filter: [
					'any',
					['==', 'class', 'wood'],
					['==', 'class', 'grass'],
					['==', 'subclass', 'recreation_ground']
				],
				paint: {
					'fill-color': '#bdf29f',
					'fill-opacity': 0.42
				}
			},
			{
				id: 'parks',
				type: 'fill' as const,
				source: 'basemap',
				'source-layer': 'park',
				minzoom: 6,
				paint: {
					'fill-color': '#b9f59c',
					'fill-opacity': 0.48
				}
			},
			{
				id: 'water',
				type: 'fill' as const,
				source: 'basemap',
				'source-layer': 'water',
				filter: ['==', '$type', 'Polygon'],
				paint: {
					'fill-color': '#cfe9ff',
					'fill-antialias': true
				}
			},
			{
				id: 'waterways',
				type: 'line' as const,
				source: 'basemap',
				'source-layer': 'waterway',
				minzoom: 7,
				paint: {
					'line-color': '#b6dcf4',
					'line-opacity': 0.5,
					'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.35, 12, 1.1, 16, 2.4]
				}
			},
			{
				id: 'roads-major',
				type: 'line' as const,
				source: 'basemap',
				'source-layer': 'transportation',
				minzoom: 5,
				filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary'],
				layout: {
					'line-cap': 'round' as const,
					'line-join': 'round' as const
				},
				paint: {
					'line-color': '#f7fff1',
					'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.18, 8, 0.32, 12, 0.48],
					'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.45, 8, 0.75, 12, 1.8, 16, 4]
				}
			},
			{
				id: 'roads-minor',
				type: 'line' as const,
				source: 'basemap',
				'source-layer': 'transportation',
				minzoom: 10,
				filter: ['in', 'class', 'tertiary', 'minor', 'service'],
				layout: {
					'line-cap': 'round' as const,
					'line-join': 'round' as const
				},
				paint: {
					'line-color': '#f8fff4',
					'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.14, 14, 0.34],
					'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.35, 14, 1.2, 17, 2.6]
				}
			}
		]
	} as unknown as StyleSpecification;

	function isNationalView(bbox: [number, number, number, number]) {
		return bbox[2] - bbox[0] > 8;
	}

	function getFitOptions(bbox: [number, number, number, number]) {
		const width = typeof window === 'undefined' ? 1440 : window.innerWidth;
		const compact = width < 820;
		const isNational = isNationalView(bbox);
		const sidePadding = compact ? 18 : isNational ? 44 : 32;

		return {
			padding: {
				top: compact ? 96 : 108,
				right: sidePadding,
				bottom: compact ? 28 : 36,
				left: sidePadding
			},
			duration: 800,
			maxZoom: isNational ? 5.2 : 8.6
		};
	}

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

	function postsToFeatures(): GeoJSON.FeatureCollection<GeoJSON.Point> {
		return {
			type: 'FeatureCollection',
			features: posts.map((post) => ({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [post.lng, post.lat] },
				properties: {
					id: post.id,
					selected: post.id === selectedPostId,
					hovered: post.id === hoveredPostId
				}
			}))
		};
	}

	function selectedRadiusFeatures(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
		const post = posts.find((item) => item.id === selectedPostId);
		return {
			type: 'FeatureCollection',
			features: post ? [buildCircle(post.lng, post.lat, post.impactRadiusM)] : []
		};
	}

	function syncPostLayers() {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		const postSource = m.getSource('posts') as import('maplibre-gl').GeoJSONSource | undefined;
		const radiusSource = m.getSource('selected-radius') as
			| import('maplibre-gl').GeoJSONSource
			| undefined;

		postSource?.setData(postsToFeatures());
		radiusSource?.setData(selectedRadiusFeatures());
	}

	function fitToPostRadius(post: PostSummary) {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		const ring = buildCircle(post.lng, post.lat, post.impactRadiusM).geometry.coordinates[0];
		const width = container.clientWidth;
		const compact = width < 820;
		const sidePadding = compact ? 24 : Math.min(320, Math.max(180, width * 0.22));

		let minLng = Infinity;
		let minLat = Infinity;
		let maxLng = -Infinity;
		let maxLat = -Infinity;

		for (const [lng, lat] of ring) {
			if (lng < minLng) minLng = lng;
			if (lng > maxLng) maxLng = lng;
			if (lat < minLat) minLat = lat;
			if (lat > maxLat) maxLat = lat;
		}

		m.fitBounds(
			[
				[minLng, minLat],
				[maxLng, maxLat]
			],
			{
				padding: {
					top: 116,
					right: sidePadding,
					bottom: 56,
					left: sidePadding
				},
				duration: 450,
				maxZoom: 12.5
			}
		);
	}

	export function fitToPosts(postsToFit: PostSummary[]) {
		if (!map || !maplibre || postsToFit.length === 0) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		const compact = container.clientWidth < 820;

		if (postsToFit.length === 1) {
			const post = postsToFit[0];
			m.easeTo({
				center: [post.lng, post.lat],
				zoom: 10,
				duration: 500
			});
			return;
		}

		let minLng = Infinity;
		let minLat = Infinity;
		let maxLng = -Infinity;
		let maxLat = -Infinity;

		for (const post of postsToFit) {
			if (post.lng < minLng) minLng = post.lng;
			if (post.lng > maxLng) maxLng = post.lng;
			if (post.lat < minLat) minLat = post.lat;
			if (post.lat > maxLat) maxLat = post.lat;
		}

		m.fitBounds(
			[
				[minLng, minLat],
				[maxLng, maxLat]
			],
			{
				padding: {
					top: compact ? 150 : 120,
					right: compact ? 28 : 72,
					bottom: compact ? 118 : 48,
					left: compact ? 28 : 360
				},
				duration: 650,
				maxZoom: 10.5
			}
		);
	}

	export function getMarkerScreenPos(postId: string): { x: number; y: number } | null {
		if (!map || !maplibre) return null;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		const post = posts.find((item) => item.id === postId);
		if (!post) return null;

		const lngLat = new ml.LngLat(post.lng, post.lat);
		const point = m.project(lngLat);
		const rect = container.getBoundingClientRect();
		return {
			x: rect.left + point.x,
			y: rect.top + point.y
		};
	}

	export function getViewportState(): MapViewportState | null {
		if (!map || !maplibre) return null;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		const center = m.getCenter();
		const bounds = m.getBounds();

		return {
			centerLng: center.lng,
			centerLat: center.lat,
			zoom: m.getZoom(),
			bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
		};
	}

	export function fitToBbox(bbox: [number, number, number, number]) {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		const bounds: [[number, number], [number, number]] = [
			[bbox[0], bbox[1]],
			[bbox[2], bbox[3]]
		];
		const options = getFitOptions(bbox);
		const camera = m.cameraForBounds(bounds, options) as CameraOptions | undefined;

		if (camera) {
			if (isNationalView(bbox)) {
				camera.center = NZ_VISUAL_CENTER;
				camera.zoom = Math.max((camera.zoom ?? 4.75) - 0.1, 4.25);
			}

			m.easeTo({
				...camera,
				duration: options.duration
			});
			return;
		}

		m.fitBounds(bounds, options);
	}

	export function focusOnLocation(lng: number, lat: number, radiusKm = 5) {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;

		m.easeTo({
			center: [lng, lat],
			zoom: radiusKm <= 5 ? 12 : 10,
			duration: 450
		});
		onMarkerPositionsChange();
	}

	onMount(async () => {
		maplibre = (await import('maplibre-gl')) as typeof import('maplibre-gl');
		const ml = maplibre as typeof import('maplibre-gl');

		const m = new ml.Map({
			container,
			style: BASEMAP_STYLE,
			center: [173.3, -41.2],
			zoom: 4.75,
			renderWorldCopies: true,
			dragRotate: false,
			touchPitch: false,
			attributionControl: false
		});

		m.addControl(new ml.AttributionControl({ compact: true }), 'bottom-left');
		m.addControl(
			new ml.NavigationControl({ visualizePitch: false, showCompass: false }),
			'bottom-right'
		);

		map = m;

		m.on('load', () => {
			m.addSource('selected-radius', { type: 'geojson', data: EMPTY_FEATURES });
			m.addLayer({
				id: 'selected-radius-fill',
				type: 'fill',
				source: 'selected-radius',
				paint: { 'fill-color': '#6366f1', 'fill-opacity': 0.16 }
			});
			m.addLayer({
				id: 'selected-radius-line',
				type: 'line',
				source: 'selected-radius',
				paint: { 'line-color': '#4f46e5', 'line-width': 2.4, 'line-opacity': 0.78 }
			});
			m.addSource('posts', { type: 'geojson', data: postsToFeatures() });
			m.addLayer({
				id: 'post-point',
				type: 'circle',
				source: 'posts',
				paint: {
					'circle-radius': [
						'case',
						['==', ['get', 'selected'], true],
						9,
						['==', ['get', 'hovered'], true],
						8,
						6
					],
					'circle-color': [
						'case',
						['==', ['get', 'selected'], true],
						'#4f46e5',
						'#111827'
					],
					'circle-opacity': 0.95,
					'circle-stroke-color': '#ffffff',
					'circle-stroke-width': [
						'case',
						['==', ['get', 'selected'], true],
						3,
						2
					]
				}
			});

			fitToBbox(NZ_BBOX);
			syncPostLayers();
			onMarkerPositionsChange();
			onMapReady(m);

			m.on('click', 'post-point', (e) => {
				if (disableSelection) return;
				const id = e.features?.[0]?.properties?.id as string | undefined;
				const post = posts.find((item) => item.id === id);
				if (!post) return;
				onSelectPost(post.id);
				fitToPostRadius(post);
			});

			m.on('click', (e) => {
				if (disableSelection) return;
				const features = m.queryRenderedFeatures(e.point, { layers: ['post-point'] });
				if (features.length === 0) onSelectPost(null);
			});

			m.on('mouseenter', 'post-point', () => {
				m.getCanvas().style.cursor = 'pointer';
			});

			m.on('mouseleave', 'post-point', () => {
				m.getCanvas().style.cursor = '';
			});
		});

		m.on('move', onMarkerPositionsChange);
		m.on('zoom', onMarkerPositionsChange);
		m.on('resize', onMarkerPositionsChange);
	});

	onDestroy(() => {
		if (map && maplibre) {
			const ml = maplibre as typeof import('maplibre-gl');
			(map as InstanceType<typeof ml.Map>).remove();
		}
	});

	$effect(() => {
		posts;
		hoveredPostId;
		selectedPostId;
		disableSelection;
		syncPostLayers();
	});
</script>

<div class="map-wrap">
	<div bind:this={container} class="map-container"></div>
</div>

<style>
	.map-wrap {
		width: 100%;
		height: 100%;
		position: relative;
		background: #cfe9ff;
	}

	.map-container {
		width: 100%;
		height: 100%;
	}

	:global(.map-container .maplibregl-ctrl-bottom-right),
	:global(.map-container .maplibregl-ctrl-bottom-left) {
		margin: 0 18px 18px;
	}

	:global(.map-container .maplibregl-ctrl-group) {
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.7);
	}
</style>
