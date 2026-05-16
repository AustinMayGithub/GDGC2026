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

	const NZ_VISUAL_CENTER: [number, number] = [174.25, -41.15];

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
			maxZoom: isNational ? 5.2 : 8.6
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
					? `background: linear-gradient(120deg, #6366f1, #ec4899);
					   border: none;
					   box-shadow: 0 0 0 2px #fff, 0 2px 8px rgba(99,102,241,0.45);`
					: `background: #fff;
					   border: 2px solid #6366f1;
					   box-shadow: 0 0 0 1px rgba(99,102,241,0.2), 0 2px 6px rgba(99,102,241,0.2);`
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
						? '0 0 0 3px #fff, 0 4px 16px rgba(99,102,241,0.7)'
						: '0 0 0 2px #6366f1, 0 4px 12px rgba(99,102,241,0.5)'
					: post.category === 'factual'
						? '0 0 0 2px #fff, 0 2px 8px rgba(99,102,241,0.45)'
						: '0 0 0 1px rgba(99,102,241,0.2), 0 2px 6px rgba(99,102,241,0.2)';
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
		border-radius: 16px;
		overflow: hidden;
		box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.7);
	}
</style>
