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
	const OUTLINE_COLOR = 'rgba(92, 126, 111, 0.2)';
	const NZ_VISUAL_CENTER: [number, number] = [174.15, -41.2];

	const NZ_BASE_FEATURES: Feature[] = [
		{
			type: 'Feature',
			properties: { island: 'north' },
			geometry: {
				type: 'Polygon',
				coordinates: [[
					[174.32, -34.38],
					[173.86, -34.78],
					[173.4, -35.35],
					[173.18, -35.96],
					[173.23, -36.45],
					[173.48, -37.02],
					[173.88, -37.68],
					[174.2, -38.28],
					[174.42, -38.95],
					[174.58, -39.55],
					[174.8, -40.08],
					[175.12, -40.55],
					[175.48, -40.92],
					[175.94, -41.2],
					[176.28, -41.28],
					[176.56, -40.92],
					[176.86, -40.36],
					[177.2, -39.72],
					[177.48, -39.08],
					[177.5, -38.58],
					[177.18, -38.04],
					[176.66, -37.7],
					[176.02, -37.56],
					[175.4, -37.44],
					[174.96, -37.06],
					[174.66, -36.58],
					[174.38, -36.06],
					[174.16, -35.52],
					[174.08, -34.98],
					[174.1, -34.58],
					[174.32, -34.38]
				]]
			}
		},
		{
			type: 'Feature',
			properties: { island: 'south' },
			geometry: {
				type: 'Polygon',
				coordinates: [[
					[172.7, -40.48],
					[173.28, -40.76],
					[173.84, -41.26],
					[174.26, -41.88],
					[174.32, -42.42],
					[174.02, -42.96],
					[173.58, -43.46],
					[173.18, -43.92],
					[172.9, -44.42],
					[172.32, -44.92],
					[171.64, -45.34],
					[170.94, -45.74],
					[170.14, -46.06],
					[169.38, -46.34],
					[168.82, -46.3],
					[168.28, -46.02],
					[167.9, -45.52],
					[167.78, -44.96],
					[167.88, -44.36],
					[168.14, -43.76],
					[168.44, -43.16],
					[168.78, -42.56],
					[169.14, -42.08],
					[169.66, -41.72],
					[170.24, -41.42],
					[170.92, -41.14],
					[171.56, -40.82],
					[172.08, -40.62],
					[172.7, -40.48]
				]]
			}
		},
		{
			type: 'Feature',
			properties: { island: 'stewart' },
			geometry: {
				type: 'Polygon',
				coordinates: [[
					[167.86, -46.84],
					[168.18, -46.78],
					[168.34, -46.92],
					[168.22, -47.08],
					[167.96, -47.1],
					[167.8, -46.98],
					[167.86, -46.84]
				]]
			}
		},
		{
			type: 'Feature',
			properties: { island: 'chatham' },
			geometry: {
				type: 'Polygon',
				coordinates: [[
					[183.35, -43.9],
					[183.62, -43.82],
					[183.72, -43.98],
					[183.48, -44.08],
					[183.35, -43.9]
				]]
			}
		}
	];

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

	const LOCAL_STYLE = {
		version: 8 as const,
		sources: {
			nz: {
				type: 'geojson' as const,
				data: NZ_OUTLINE
			}
		},
		layers: [
			{
				id: 'water',
				type: 'background' as const,
				paint: {
					'background-color': WATER_COLOR
				}
			},
			{
				id: 'land',
				type: 'fill' as const,
				source: 'nz',
				paint: {
					'fill-color': LAND_COLOR
				}
			},
			{
				id: 'land-outline',
				type: 'line' as const,
				source: 'nz',
				paint: {
					'line-color': OUTLINE_COLOR,
					'line-width': 1.2
				}
			}
		]
	};

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
			maxZoom: isNational ? 5.4 : 8.6
		};
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
			style: LOCAL_STYLE,
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
		filter: none;
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
