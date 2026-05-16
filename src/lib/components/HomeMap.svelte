<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import type { PostSummary } from '$lib/types';
	import { NZ_BBOX } from '$lib/data/nz-regions';

	interface Props {
		posts: PostSummary[];
		hoveredPostId: string | null;
		onMapReady: (map: unknown) => void;
		onMarkerPositionsChange: () => void;
	}

	type CameraOptions = {
		center?: [number, number];
		zoom?: number;
		duration?: number;
	};

	type StyleLayer = {
		id?: string;
		type?: string;
		layout?: Record<string, unknown>;
		paint?: Record<string, unknown>;
		['source-layer']?: string;
	};

	let { posts, hoveredPostId, onMapReady, onMarkerPositionsChange }: Props = $props();

	let container: HTMLDivElement;
	let map: unknown = null;
	let maplibre: typeof import('maplibre-gl') | null = null;
	let markersMap = new Map<string, { marker: unknown; el: HTMLElement }>();
	let locationMarker: unknown = null;

	const MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
	const WATER_COLOR = '#cfe9ff';
	const LAND_COLOR = '#c7ffab';
	const PARK_COLOR = '#d9ffc6';
	const ROAD_COLOR = 'rgba(255, 255, 255, 0.42)';
	const BORDER_COLOR = 'rgba(92, 126, 111, 0.16)';
	const NZ_VISUAL_CENTER: [number, number] = [174.25, -41.15];

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

	function setLayerVisibility(
		m: InstanceType<NonNullable<typeof maplibre>['Map']>,
		layerId: string,
		visibility: 'visible' | 'none'
	) {
		try {
			m.setLayoutProperty(layerId, 'visibility', visibility);
		} catch {}
	}

	function setLayerPaint(
		m: InstanceType<NonNullable<typeof maplibre>['Map']>,
		layerId: string,
		property: string,
		value: unknown
	) {
		try {
			m.setPaintProperty(layerId, property, value);
		} catch {}
	}

	function applyMinimalTheme() {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		const style = m.getStyle();
		const layers = (style.layers ?? []) as StyleLayer[];

		for (const layer of layers) {
			const id = String(layer.id ?? '').toLowerCase();
			const sourceLayer = String(layer['source-layer'] ?? '').toLowerCase();
			const type = String(layer.type ?? '');
			const layerId = String(layer.id ?? '');

			const isLabelLayer =
				type === 'symbol' ||
				id.includes('label') ||
				id.includes('name') ||
				id.includes('place') ||
				id.includes('poi') ||
				sourceLayer.includes('label') ||
				sourceLayer.includes('place');
			if (isLabelLayer) {
				setLayerVisibility(m, layerId, 'none');
				continue;
			}

			const isBuilding =
				id.includes('building') ||
				id.includes('structure') ||
				sourceLayer.includes('building');
			if (isBuilding) {
				setLayerVisibility(m, layerId, 'none');
				continue;
			}

			const isTransit =
				id.includes('transit') ||
				id.includes('rail') ||
				id.includes('aeroway') ||
				id.includes('runway') ||
				id.includes('ferry');
			if (isTransit) {
				setLayerVisibility(m, layerId, 'none');
				continue;
			}

			const isBoundary =
				id.includes('boundary') ||
				id.includes('admin') ||
				id.includes('border') ||
				sourceLayer.includes('boundary');
			if (isBoundary) {
				if (type === 'line') {
					setLayerPaint(m, layerId, 'line-color', BORDER_COLOR);
					setLayerPaint(m, layerId, 'line-opacity', 0.14);
					setLayerPaint(m, layerId, 'line-width', 0.7);
				} else {
					setLayerVisibility(m, layerId, 'none');
				}
				continue;
			}

			const isWater =
				id.includes('water') ||
				id.includes('ocean') ||
				id.includes('river') ||
				id.includes('lake') ||
				sourceLayer.includes('water');
			if (isWater) {
				if (type === 'background') {
					setLayerPaint(m, layerId, 'background-color', WATER_COLOR);
				}
				if (type === 'fill') {
					setLayerPaint(m, layerId, 'fill-color', WATER_COLOR);
					setLayerPaint(m, layerId, 'fill-outline-color', WATER_COLOR);
				}
				if (type === 'line') {
					setLayerVisibility(m, layerId, 'none');
				}
				continue;
			}

			const isRoad =
				id.includes('road') ||
				id.includes('street') ||
				id.includes('highway') ||
				id.includes('bridge') ||
				id.includes('tunnel') ||
				id.includes('path') ||
				sourceLayer.includes('road') ||
				sourceLayer.includes('transport');
			if (isRoad) {
				const keepMajor =
					id.includes('motorway') ||
					id.includes('trunk') ||
					id.includes('major') ||
					id.includes('primary');
				if (!keepMajor) {
					setLayerVisibility(m, layerId, 'none');
				} else if (type === 'line') {
					setLayerPaint(m, layerId, 'line-color', ROAD_COLOR);
					setLayerPaint(m, layerId, 'line-opacity', 0.18);
				}
				continue;
			}

			const isLand =
				type === 'background' ||
				id.includes('land') ||
				id.includes('park') ||
				id.includes('grass') ||
				id.includes('wood') ||
				id.includes('forest') ||
				id.includes('natural') ||
				id.includes('landcover') ||
				id.includes('landuse') ||
				sourceLayer.includes('landcover') ||
				sourceLayer.includes('landuse') ||
				sourceLayer.includes('park');
			if (isLand) {
				if (type === 'background') {
					setLayerPaint(m, layerId, 'background-color', WATER_COLOR);
				}
				if (type === 'fill') {
					const fill = id.includes('park') || id.includes('forest') ? PARK_COLOR : LAND_COLOR;
					setLayerPaint(m, layerId, 'fill-color', fill);
					setLayerPaint(m, layerId, 'fill-outline-color', fill);
				}
				if (type === 'line') {
					setLayerVisibility(m, layerId, 'none');
				}
			}
		}
	}

	function createMarkerEl(post: PostSummary, hovered: boolean): HTMLElement {
		const el = document.createElement('div');
		el.className = post.category === 'factual' ? 'marker-factual' : 'marker-personal';
		el.setAttribute('data-post-id', post.id);
		el.style.cssText = `
			width: 14px;
			height: 14px;
			border-radius: 50%;
			cursor: pointer;
			transition: transform 0.15s ease, box-shadow 0.15s ease;
			${
				post.category === 'factual'
					? `background: linear-gradient(135deg, #111827, #475569);
					   border: none;
					   box-shadow: 0 0 0 2px #fffef8, 0 2px 10px rgba(15, 23, 42, 0.34);`
					: `background: #fff;
					   border: 2px solid #111827;
					   box-shadow: 0 0 0 1px rgba(255, 254, 248, 0.9), 0 2px 8px rgba(15, 23, 42, 0.18);`
			}
			${hovered ? 'transform: scale(1.6); z-index: 2;' : ''}
		`;
		return el;
	}

	function syncMarkers() {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;

		const currentIds = new Set(posts.map((p) => p.id));
		for (const [id, { marker }] of markersMap) {
			if (!currentIds.has(id)) {
				(marker as InstanceType<typeof ml.Marker>).remove();
				markersMap.delete(id);
			}
		}

		for (const post of posts) {
			if (markersMap.has(post.id)) {
				const { el } = markersMap.get(post.id)!;
				const hovered = hoveredPostId === post.id;
				el.style.transform = hovered ? 'scale(1.6)' : '';
				el.style.zIndex = hovered ? '2' : '1';
				el.style.boxShadow = hovered
					? post.category === 'factual'
						? '0 0 0 3px #fffef8, 0 5px 18px rgba(15, 23, 42, 0.42)'
						: '0 0 0 2px #111827, 0 5px 16px rgba(15, 23, 42, 0.28)'
					: post.category === 'factual'
						? '0 0 0 2px #fffef8, 0 2px 10px rgba(15, 23, 42, 0.34)'
						: '0 0 0 1px rgba(255, 254, 248, 0.9), 0 2px 8px rgba(15, 23, 42, 0.18)';
			} else {
				const el = createMarkerEl(post, hoveredPostId === post.id);
				el.addEventListener('click', () => goto(`/post/${post.id}`));
				const marker = new ml.Marker({ element: el }).setLngLat([post.lng, post.lat]).addTo(m);
				markersMap.set(post.id, { marker, el });
			}
		}
	}

	function createLocationMarkerEl(): HTMLElement {
		const el = document.createElement('div');
		el.setAttribute('aria-label', 'Current location');
		el.style.cssText = `
			width: 18px;
			height: 18px;
			border-radius: 50%;
			background: #2563eb;
			border: 3px solid #fff;
			box-shadow: 0 2px 10px rgba(37, 99, 235, 0.32);
			pointer-events: none;
		`;
		return el;
	}

	export function getMarkerScreenPos(postId: string): { x: number; y: number } | null {
		if (!map || !maplibre) return null;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		const entry = markersMap.get(postId);
		if (!entry) return null;

		const marker = entry.marker as InstanceType<typeof ml.Marker>;
		const lngLat = marker.getLngLat();
		const point = m.project(lngLat);
		const rect = container.getBoundingClientRect();
		return {
			x: rect.left + point.x,
			y: rect.top + point.y
		};
	}

	export function focusOnLocation(lng: number, lat: number, radiusKm = 5) {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;

		if (!locationMarker) {
			locationMarker = new ml.Marker({
				element: createLocationMarkerEl(),
				anchor: 'center'
			})
				.setLngLat([lng, lat])
				.addTo(m);
		} else {
			(locationMarker as InstanceType<typeof ml.Marker>).setLngLat([lng, lat]);
		}

		m.easeTo({
			center: [lng, lat],
			zoom: radiusKm <= 5 ? 12 : 10,
			duration: 450
		});
		onMarkerPositionsChange();
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

	onMount(async () => {
		maplibre = (await import('maplibre-gl')) as typeof import('maplibre-gl');
		const ml = maplibre as typeof import('maplibre-gl');

		const m = new ml.Map({
			container,
			style: MAP_STYLE_URL,
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
			applyMinimalTheme();
			fitToBbox(NZ_BBOX);
			syncMarkers();
			onMarkerPositionsChange();
			onMapReady(m);
		});

		m.on('styledata', applyMinimalTheme);
		m.on('move', onMarkerPositionsChange);
		m.on('zoom', onMarkerPositionsChange);
		m.on('resize', onMarkerPositionsChange);
	});

	onDestroy(() => {
		if (map && maplibre) {
			const ml = maplibre as typeof import('maplibre-gl');
			(map as InstanceType<typeof ml.Map>).remove();
		}
		markersMap.clear();
		locationMarker = null;
	});

	$effect(() => {
		posts;
		hoveredPostId;
		syncMarkers();
		onMarkerPositionsChange();
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
		background:
			radial-gradient(circle at top, rgba(255, 255, 255, 0.34), transparent 34%),
			linear-gradient(180deg, #def3ff 0%, #cfe9ff 100%);
		overflow: hidden;
	}

	.map-wrap::before,
	.map-wrap::after {
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: none;
		content: '';
	}

	.map-wrap::before {
		background:
			radial-gradient(circle at 50% 42%, rgba(255, 253, 244, 0.32), transparent 32%),
			linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(148, 163, 184, 0.12));
		mix-blend-mode: soft-light;
	}

	.map-wrap::after {
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.44), inset 0 0 90px rgba(15, 23, 42, 0.08);
	}

	.map-container {
		width: 100%;
		height: 100%;
		position: relative;
		z-index: 0;
	}

	:global(.map-container .maplibregl-ctrl-bottom-right),
	:global(.map-container .maplibregl-ctrl-bottom-left) {
		margin: 0 18px 18px;
	}

	:global(.map-container .maplibregl-ctrl-group) {
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 10px 28px rgba(84, 126, 136, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.8);
		background: rgba(255, 255, 255, 0.8);
	}

	:global(.map-container .maplibregl-ctrl button) {
		background: rgba(255, 255, 255, 0.78);
	}

	:global(.map-container .maplibregl-ctrl button .maplibregl-ctrl-icon) {
		opacity: 0.78;
	}
</style>
