<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PostSummary } from '$lib/types';
	import { NZ_BBOX } from '$lib/data/nz-regions';

	interface Props {
		posts: PostSummary[];
		hoveredPostId: string | null;
		onMapReady: (map: unknown) => void;
		onMarkerPositionsChange: () => void;
	}

	type MapStyle = {
		version: number;
		sources: Record<string, unknown>;
		layers: Array<Record<string, unknown>>;
		glyphs?: string;
		sprite?: string;
	};

	type CameraOptions = {
		center?: [number, number];
		zoom?: number;
		duration?: number;
	};

	let { posts, hoveredPostId, onMapReady, onMarkerPositionsChange }: Props = $props();

	let container: HTMLDivElement;
	let map: unknown = null;
	let maplibre: typeof import('maplibre-gl') | null = null;
	let markersMap = new Map<string, { marker: unknown; el: HTMLElement }>();

	const WATER_COLOR = '#cfe9ff';
	const LAND_COLOR = '#c7ffab';
	const LAND_TINT = '#dfffd0';
	const ROAD_COLOR = '#f7ffef';
	const LABEL_COLOR = '#62807a';
	const BORDER_COLOR = 'rgba(92, 126, 111, 0.16)';
	const CARTO_POSITRON_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
	const NZ_VISUAL_CENTER: [number, number] = [174.25, -41.15];

	const FALLBACK_STYLE: MapStyle = {
		version: 8,
		sources: {
			carto: {
				type: 'raster',
				tiles: ['https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png'],
				tileSize: 256,
				attribution: 'OpenStreetMap contributors'
			}
		},
		layers: [
			{
				id: 'carto-base',
				type: 'raster',
				source: 'carto'
			}
		]
	};

	function isNationalView(bbox: [number, number, number, number]) {
		return bbox[2] - bbox[0] > 8;
	}

	function cloneLayer(layer: Record<string, unknown>) {
		return {
			...layer,
			layout: layer.layout ? { ...(layer.layout as Record<string, unknown>) } : undefined,
			paint: layer.paint ? { ...(layer.paint as Record<string, unknown>) } : undefined
		};
	}

	function setPaintColor(
		paint: Record<string, unknown> | undefined,
		keys: string[],
		color: string,
		opacity?: number
	) {
		if (!paint) return;
		for (const key of keys) {
			if (key in paint) paint[key] = color;
		}

		if (opacity !== undefined) {
			for (const key of Object.keys(paint)) {
				if (key.endsWith('-opacity')) paint[key] = opacity;
			}
		}
	}

	function buildMinimalStyle(baseStyle: MapStyle): MapStyle {
		return {
			...baseStyle,
			layers: baseStyle.layers
				.map((rawLayer) => {
					const layer = cloneLayer(rawLayer);
					const id = String(layer.id ?? '').toLowerCase();
					const sourceLayer = String(layer['source-layer'] ?? '').toLowerCase();
					const layout = (layer.layout ??= {});
					const paint = (layer.paint ??= {});
					const type = String(layer.type ?? '');

					const isLabelLayer =
						type === 'symbol' ||
						id.includes('label') ||
						id.includes('place') ||
						id.includes('poi') ||
						id.includes('name') ||
						sourceLayer.includes('label') ||
						sourceLayer.includes('place');

					if (isLabelLayer) {
						layout.visibility = 'none';
						return layer;
					}

					const isBoundary =
						id.includes('boundary') ||
						id.includes('admin') ||
						id.includes('border') ||
						sourceLayer.includes('boundary');
					if (isBoundary) {
						if (type === 'line') {
							paint['line-color'] = BORDER_COLOR;
							paint['line-opacity'] = 0.16;
							paint['line-width'] = 0.6;
						} else {
							layout.visibility = 'none';
						}
						return layer;
					}

					const isRoad =
						id.includes('road') ||
						id.includes('street') ||
						id.includes('highway') ||
						id.includes('bridge') ||
						id.includes('tunnel') ||
						id.includes('path') ||
						id.includes('rail') ||
						sourceLayer.includes('road') ||
						sourceLayer.includes('transport');
					if (isRoad) {
						if (id.includes('motorway') || id.includes('trunk') || id.includes('major')) {
							paint['line-color'] = ROAD_COLOR;
							paint['line-opacity'] = 0.18;
							paint['line-width'] = [
								'interpolate',
								['linear'],
								['zoom'],
								4,
								0.25,
								8,
								0.7,
								12,
								1.2
							];
						} else {
							layout.visibility = 'none';
						}
						return layer;
					}

					const isWater =
						id.includes('water') ||
						id.includes('ocean') ||
						id.includes('river') ||
						id.includes('lake') ||
						sourceLayer.includes('water');
					if (isWater) {
						if (type === 'fill') {
							setPaintColor(paint, ['fill-color'], WATER_COLOR, 1);
							paint['fill-outline-color'] = WATER_COLOR;
						}
						if (type === 'line') {
							layout.visibility = 'none';
						}
						if (type === 'background') {
							paint['background-color'] = WATER_COLOR;
						}
						return layer;
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
							paint['background-color'] = WATER_COLOR;
						}
						if (type === 'fill') {
							setPaintColor(
								paint,
								['fill-color'],
								id.includes('park') || id.includes('forest') || sourceLayer.includes('park')
									? LAND_TINT
									: LAND_COLOR,
								1
							);
							paint['fill-outline-color'] = 'rgba(104, 136, 113, 0.08)';
						}
						if (type === 'line') {
							layout.visibility = 'none';
						}
						return layer;
					}

					const isBuilding =
						id.includes('building') ||
						sourceLayer.includes('building') ||
						id.includes('structure');
					if (isBuilding) {
						layout.visibility = 'none';
						return layer;
					}

					const isTransit =
						id.includes('transit') ||
						id.includes('aeroway') ||
						id.includes('runway') ||
						id.includes('ferry');
					if (isTransit) {
						layout.visibility = 'none';
						return layer;
					}

					if (type === 'hillshade' || id.includes('hillshade') || id.includes('contour')) {
						layout.visibility = 'none';
						return layer;
					}

					if (type === 'fill') {
						if ('fill-color' in paint) {
							const current = String(paint['fill-color'] ?? '').toLowerCase();
							if (current.includes('fff') || current.includes('f4') || current.includes('f5')) {
								paint['fill-color'] = LAND_COLOR;
							}
						}
					}

					if (type === 'line' && id.includes('coast')) {
						paint['line-opacity'] = 0;
					}

					if (type === 'symbol') {
						paint['text-color'] = LABEL_COLOR;
					}

					return layer;
				})
		};
	}

	async function loadMinimalStyle(): Promise<MapStyle> {
		try {
			const res = await fetch(CARTO_POSITRON_STYLE_URL);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const baseStyle = (await res.json()) as MapStyle;
			return buildMinimalStyle(baseStyle);
		} catch {
			return FALLBACK_STYLE;
		}
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
			maxZoom: isNational ? 5.15 : 8.6
		};
	}

	function bboxForRadius(
		lng: number,
		lat: number,
		radiusKm: number
	): [number, number, number, number] {
		const latDelta = radiusKm / 111.32;
		const lngDelta = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
		return [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta];
	}

	function zoomForRadius(lat: number, radiusKm: number) {
		const width = container?.clientWidth ?? 1280;
		const height = container?.clientHeight ?? 720;
		const padding = width < 820 ? 20 : 28;
		const usableHalfSpanPx = Math.max(Math.min(width, height) / 2 - padding, 80);
		const radiusMeters = radiusKm * 1000;
		const metersPerPixelAtZoom0 =
			(Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * 6378137) / 256;

		return Math.min(
			16,
			Math.max(3, Math.log2((metersPerPixelAtZoom0 * usableHalfSpanPx) / radiusMeters))
		);
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
					? `background: linear-gradient(120deg, #8fd36f, #7fcdf4);
					   border: none;
					   box-shadow: 0 0 0 2px #fff, 0 2px 10px rgba(111,166,129,0.35);`
					: `background: #fff;
					   border: 2px solid #8ccf7b;
					   box-shadow: 0 0 0 1px rgba(140,207,123,0.24), 0 2px 8px rgba(111,166,129,0.2);`
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
				el.style.boxShadow = hovered
					? post.category === 'factual'
						? '0 0 0 3px #fff, 0 6px 18px rgba(127,205,244,0.42)'
						: '0 0 0 2px #8ccf7b, 0 6px 14px rgba(140,207,123,0.36)'
					: post.category === 'factual'
						? '0 0 0 2px #fff, 0 2px 10px rgba(111,166,129,0.35)'
						: '0 0 0 1px rgba(140,207,123,0.24), 0 2px 8px rgba(111,166,129,0.2)';
			} else {
				const el = createMarkerEl(post, hoveredPostId === post.id);
				el.addEventListener('click', () => goto(`/post/${post.id}`));
				const marker = new ml.Marker({ element: el }).setLngLat([post.lng, post.lat]).addTo(m);
				markersMap.set(post.id, { marker, el });
			}
		}
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
				camera.zoom = Math.max((camera.zoom ?? 4.6) - 0.12, 4.2);
			}

			m.easeTo({
				...camera,
				duration: options.duration
			});
			return;
		}

		m.fitBounds(bounds, options);
	}

	export function focusOnLocation(lng: number, lat: number, radiusKm = 20) {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;

		m.easeTo({
			center: [lng, lat],
			zoom: zoomForRadius(lat, radiusKm),
			duration: 800
		});
	}

	onMount(async () => {
		maplibre = (await import('maplibre-gl')) as typeof import('maplibre-gl');
		const ml = maplibre as typeof import('maplibre-gl');
		const mapStyle = await loadMinimalStyle();

		const m = new ml.Map({
			container,
			style: mapStyle,
			center: [173.3, -41.2],
			zoom: 4.7,
			renderWorldCopies: false,
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
			fitToBbox(NZ_BBOX);
			syncMarkers();
			onMarkerPositionsChange();
			onMapReady(m);
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
		syncMarkers();
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
			radial-gradient(circle at top, rgba(255, 255, 255, 0.5), transparent 34%),
			linear-gradient(180deg, #e5f4ff 0%, #cfe9ff 100%);
	}

	.map-container {
		width: 100%;
		height: 100%;
	}

	:global(.map-container .maplibregl-canvas) {
		filter: saturate(0.94);
	}

	:global(.map-container .maplibregl-ctrl-bottom-right),
	:global(.map-container .maplibregl-ctrl-bottom-left) {
		margin: 0 18px 18px;
	}

	:global(.map-container .maplibregl-ctrl-group) {
		border-radius: 16px;
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

	:global(.map-container .maplibregl-ctrl-attrib) {
		background: rgba(255, 255, 255, 0.74);
		border-radius: 12px;
		color: rgba(61, 89, 97, 0.72);
	}
</style>
