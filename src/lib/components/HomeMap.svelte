<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PostSummary } from '$lib/types';
	import { NZ_BBOX } from '$lib/data/nz-regions';
	import { NZ_OUTLINE_BASE } from '$lib/data/nz-outline';

	interface Props {
		posts: PostSummary[];
		hoveredPostId: string | null;
		onMapReady: (map: unknown) => void;
		onMarkerPositionsChange: () => void;
	}

	type FeatureGeometry =
		| {
				type: 'Polygon';
				coordinates: number[][][];
		  }
		| {
				type: 'MultiPolygon';
				coordinates: number[][][][];
		  };

	type Feature = {
		type: 'Feature';
		properties: Record<string, unknown>;
		geometry: FeatureGeometry;
	};

	type FeatureCollection = {
		type: 'FeatureCollection';
		features: Feature[];
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
	const OUTLINE_COLOR = 'rgba(92, 126, 111, 0.18)';
	const NZ_VISUAL_CENTER: [number, number] = [174.25, -41.15];
	const NZ_BASE_FEATURES = NZ_OUTLINE_BASE.features as unknown as Feature[];

	const RASTER_STYLE = {
		version: 8 as const,
		sources: {
			carto: {
				type: 'raster' as const,
				tiles: ['https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png'],
				tileSize: 256,
				attribution: 'OpenStreetMap contributors'
			}
		},
		layers: [
			{
				id: 'carto-base',
				type: 'raster' as const,
				source: 'carto',
				paint: {
					'raster-opacity': 0.42,
					'raster-saturation': -0.35,
					'raster-brightness-min': 0.92,
					'raster-brightness-max': 1.08,
					'raster-contrast': -0.08
				}
			}
		]
	};

	function wrapFeature(feature: Feature, offset: number): Feature {
		if (feature.geometry.type === 'Polygon') {
			return {
				...feature,
				geometry: {
					type: 'Polygon',
					coordinates: feature.geometry.coordinates.map((ring) =>
						ring.map(([lng, lat]) => [lng + offset, lat])
					)
				}
			};
		}

		return {
			...feature,
			geometry: {
				type: 'MultiPolygon',
				coordinates: feature.geometry.coordinates.map((polygon) =>
					polygon.map((ring) => ring.map(([lng, lat]) => [lng + offset, lat]))
				)
			}
		};
	}

	function buildWrappedFeatureCollection(): FeatureCollection {
		const offsets = [-360, 0, 360];
		return {
			type: 'FeatureCollection',
			features: offsets.flatMap((offset) =>
				NZ_BASE_FEATURES.map((feature) => wrapFeature(feature, offset))
			)
		};
	}

	const NZ_OUTLINE = buildWrappedFeatureCollection();

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

	function addLandOverlay() {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;

		if (!m.getSource('nz-land')) {
			m.addSource('nz-land', {
				type: 'geojson',
				data: NZ_OUTLINE
			});
		}

		if (!m.getLayer('nz-land-fill')) {
			m.addLayer({
				id: 'nz-land-fill',
				type: 'fill',
				source: 'nz-land',
				paint: {
					'fill-color': LAND_COLOR,
					'fill-opacity': 0.68
				}
			});
		}

		if (!m.getLayer('nz-land-outline')) {
			m.addLayer({
				id: 'nz-land-outline',
				type: 'line',
				source: 'nz-land',
				paint: {
					'line-color': OUTLINE_COLOR,
					'line-width': 1.15
				}
			});
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
					? `background: linear-gradient(120deg, #9ad87a, #8fd4ff);
					   border: none;
					   box-shadow: 0 0 0 2px #fff, 0 2px 10px rgba(116,171,135,0.34);`
					: `background: #fff;
					   border: 2px solid #93d67d;
					   box-shadow: 0 0 0 1px rgba(147,214,125,0.24), 0 2px 8px rgba(116,171,135,0.2);`
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
						? '0 0 0 3px #fff, 0 6px 18px rgba(143,212,255,0.42)'
						: '0 0 0 2px #93d67d, 0 6px 14px rgba(147,214,125,0.34)'
					: post.category === 'factual'
						? '0 0 0 2px #fff, 0 2px 10px rgba(116,171,135,0.34)'
						: '0 0 0 1px rgba(147,214,125,0.24), 0 2px 8px rgba(116,171,135,0.2)';
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
			style: RASTER_STYLE,
			center: [173.3, -41.2],
			zoom: 4.75,
			renderWorldCopies: true,
			dragRotate: false,
			touchPitch: false,
			attributionControl: false
		});

		m.addControl(
			new ml.NavigationControl({ visualizePitch: false, showCompass: false }),
			'bottom-right'
		);

		map = m;

		m.on('load', () => {
			addLandOverlay();
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
			radial-gradient(circle at top, rgba(255, 255, 255, 0.34), transparent 34%),
			linear-gradient(180deg, #def3ff 0%, #cfe9ff 100%);
	}

	.map-container {
		width: 100%;
		height: 100%;
	}

	:global(.map-container .maplibregl-canvas) {
		filter: saturate(0.94);
	}

	:global(.map-container .maplibregl-ctrl-bottom-right) {
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
</style>
