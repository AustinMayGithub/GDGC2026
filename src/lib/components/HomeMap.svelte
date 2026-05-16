<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount, onDestroy } from 'svelte';
	import type { PostSummary, VotePoint } from '$lib/types';
	import { NZ_BBOX } from '$lib/data/nz-regions';
	import type { StyleSpecification } from 'maplibre-gl';

	interface Props {
		posts: PostSummary[];
		hoveredPostId: string | null;
		selectedPostId: string | null;
		disableSelection?: boolean;
		showAllRadii?: boolean;
		radiusPosts?: PostSummary[];
		selectedVotePoints?: VotePoint[];
		threeD?: boolean;
		onMapReady: (map: unknown) => void;
		onMarkerPositionsChange: () => void;
		onSelectPost: (id: string | null) => void;
		composing?: boolean;
		composeLng?: number;
		composeLat?: number;
		composeRadiusM?: number;
		onComposePick?: (lng: number, lat: number) => void;
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
	type RadiusFitOptions = {
		panelSide?: 'left' | 'right' | 'none';
		paddingScale?: number;
		duration?: number;
		maxZoom?: number;
	};

	let {
		posts,
		hoveredPostId,
		selectedPostId,
		disableSelection = false,
		showAllRadii = false,
		radiusPosts = [],
		selectedVotePoints = [],
		threeD = false,
		onMapReady,
		onMarkerPositionsChange,
		onSelectPost,
		composing = false,
		composeLng = 174.76,
		composeLat = -36.85,
		composeRadiusM = 1000,
		onComposePick
	}: Props = $props();

	let container: HTMLDivElement;
	let map: unknown = null;
	let maplibre: typeof import('maplibre-gl') | null = null;
	let skipNextBackgroundClick = false;
	let hasLoaded = false;
	let appliedThreeD: boolean | null = null;
	let buildingRemoveTimer: number | null = null;

	const NZ_VISUAL_CENTER: [number, number] = [174.25, -41.15];
	const OPENFREEMAP_VECTOR_SOURCE_URL = 'https://tiles.openfreemap.org/planet';
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

	function voteStatus(post: PostSummary) {
		const total = post.verifyCount + post.disputeCount;
		if (total === 0) return 'untouched';
		const verifyRatio = post.verifyCount / total;
		if (verifyRatio >= 0.4 && verifyRatio <= 0.6) return 'decisive';
		return verifyRatio > 0.6 ? 'factual' : 'disputed';
	}

	function popularityFor(post: PostSummary) {
		return (
			post.commentCount * 4 +
			post.reactionCount * 3 +
			(post.verifyCount + post.disputeCount) * 2
		);
	}

	function popularityScale(post: PostSummary, minPopularity: number, maxPopularity: number) {
		if (maxPopularity <= minPopularity) return 1;
		const t = (popularityFor(post) - minPopularity) / (maxPopularity - minPopularity);
		return 1 + t;
	}

	function postsToFeatures(): GeoJSON.FeatureCollection<GeoJSON.Point> {
		const popularityScores = posts.map(popularityFor);
		const minPopularity = Math.min(...popularityScores, 0);
		const maxPopularity = Math.max(...popularityScores, 0);

		return {
			type: 'FeatureCollection',
			features: posts.map((post) => ({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [post.lng, post.lat] },
				properties: {
					id: post.id,
					selected: post.id === selectedPostId,
					hovered: post.id === hoveredPostId,
					status: voteStatus(post),
					scale: popularityScale(post, minPopularity, maxPopularity)
				}
			}))
		};
	}

	function selectedRadiusFeatures(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
		if (showAllRadii) {
			const postsWithOpenRadii = radiusPosts.length > 0 ? radiusPosts : posts;
			return {
				type: 'FeatureCollection',
				features: postsWithOpenRadii.map((post) =>
					buildCircle(post.lng, post.lat, post.impactRadiusM)
				)
			};
		}

		const post = posts.find((item) => item.id === selectedPostId);
		return {
			type: 'FeatureCollection',
			features: post ? [buildCircle(post.lng, post.lat, post.impactRadiusM)] : []
		};
	}

	function composeRadiusFeatures(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
		return {
			type: 'FeatureCollection',
			features: composing ? [buildCircle(composeLng, composeLat, composeRadiusM)] : []
		};
	}

	function composePinFeatures(): GeoJSON.FeatureCollection<GeoJSON.Point> {
		return {
			type: 'FeatureCollection',
			features: composing
				? [
						{
							type: 'Feature',
							geometry: { type: 'Point', coordinates: [composeLng, composeLat] },
							properties: {}
						}
					]
				: []
		};
	}

	function votePointFeatures(vote: VotePoint['vote']): GeoJSON.FeatureCollection<GeoJSON.Point> {
		return {
			type: 'FeatureCollection',
			features: selectedVotePoints
				.filter((point) => point.vote === vote)
				.map((point) => ({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
					properties: { vote: point.vote }
				}))
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
		const composeRadiusSource = m.getSource('compose-radius') as
			| import('maplibre-gl').GeoJSONSource
			| undefined;
		const composePinSource = m.getSource('compose-pin') as
			| import('maplibre-gl').GeoJSONSource
			| undefined;
		const verifyVoteSource = m.getSource('selected-verify-votes') as
			| import('maplibre-gl').GeoJSONSource
			| undefined;
		const disputeVoteSource = m.getSource('selected-dispute-votes') as
			| import('maplibre-gl').GeoJSONSource
			| undefined;

		postSource?.setData(postsToFeatures());
		radiusSource?.setData(selectedRadiusFeatures());
		composeRadiusSource?.setData(composeRadiusFeatures());
		composePinSource?.setData(composePinFeatures());
		verifyVoteSource?.setData(votePointFeatures('verify'));
		disputeVoteSource?.setData(votePointFeatures('dispute'));
	}

	function firstLabelLayerId() {
		if (!map || !maplibre) return undefined;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		return m
			.getStyle()
			.layers?.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field'])?.id;
	}

	function addBuildingLayer() {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		if (m.getLayer('3d-buildings')) return;

		if (!m.getSource('openfreemap-3d')) {
			m.addSource('openfreemap-3d', {
				type: 'vector',
				url: OPENFREEMAP_VECTOR_SOURCE_URL,
				attribution: 'OpenFreeMap, OpenStreetMap'
			});
		}

		m.addLayer(
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
						'#e1e5ea',
						120,
						'#bac7d2',
						320,
						'#8da2b2'
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
					'fill-extrusion-opacity': 0.68
				}
			},
			firstLabelLayerId()
		);
	}

	function removeBuildingLayer() {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		if (m.getLayer('3d-buildings')) m.removeLayer('3d-buildings');
	}

	function setMapMode(duration = 450) {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		const gestureHandlers = m as unknown as {
			dragRotate?: { enable: () => void; disable: () => void };
			touchPitch?: { enable: () => void; disable: () => void };
			touchZoomRotate?: { enableRotation: () => void; disableRotation: () => void };
		};

		if (threeD) {
			if (buildingRemoveTimer !== null) {
				window.clearTimeout(buildingRemoveTimer);
				buildingRemoveTimer = null;
			}
			addBuildingLayer();
			gestureHandlers.dragRotate?.enable();
			gestureHandlers.touchPitch?.enable();
			gestureHandlers.touchZoomRotate?.enableRotation();
			(m as unknown as { setLight?: (value: unknown) => void }).setLight?.({
				anchor: 'viewport',
				color: '#ffffff',
				intensity: 0.38,
				position: [1.2, 210, 45]
			});
			m.easeTo({
				pitch: Math.max(m.getPitch(), 54),
				bearing: m.getBearing() === 0 ? -16 : m.getBearing(),
				duration
			});
		} else {
			gestureHandlers.dragRotate?.disable();
			gestureHandlers.touchPitch?.disable();
			gestureHandlers.touchZoomRotate?.disableRotation();
			m.easeTo({ pitch: 0, bearing: 0, duration });
			if (buildingRemoveTimer !== null) window.clearTimeout(buildingRemoveTimer);
			buildingRemoveTimer = window.setTimeout(() => {
				removeBuildingLayer();
				buildingRemoveTimer = null;
			}, duration + 80);
		}
		appliedThreeD = threeD;
	}

	export function fitToRadius(
		lng: number,
		lat: number,
		radiusM: number,
		options: RadiusFitOptions = {}
	) {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		const paddingScale = options.paddingScale ?? 1.18;
		const ring = buildCircle(lng, lat, radiusM * paddingScale).geometry.coordinates[0];
		const width = container.clientWidth;
		const compact = width < 820;
		const panelSide = options.panelSide ?? 'none';
		const panelWidth = Math.max(520, Math.min(760, width * 0.58 - 20));
		const panelPadding = panelWidth + 40;
		const sidePadding = compact ? 24 : Math.min(320, Math.max(180, width * 0.22));
		const leftPadding = compact
			? 28
			: panelSide === 'left'
				? panelPadding
				: panelSide === 'right'
					? 24
					: sidePadding;
		const rightPadding = compact
			? 28
			: panelSide === 'right'
				? panelPadding
				: panelSide === 'left'
					? 24
					: sidePadding;

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
					right: rightPadding,
					bottom: 56,
					left: leftPadding
				},
				duration: options.duration ?? 450,
				maxZoom: options.maxZoom ?? 14
			}
		);
	}

	export function fitToPostRadius(post: PostSummary, options: RadiusFitOptions = {}) {
		fitToRadius(post.lng, post.lat, post.impactRadiusM, options);
	}

	export function fitToPosts(postsToFit: PostSummary[]) {
		if (!map || !maplibre || postsToFit.length === 0) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;
		const compact = container.clientWidth < 820;

		if (postsToFit.length === 1) {
			fitToPostRadius(postsToFit[0]);
			return;
		}

		let minLng = Infinity;
		let minLat = Infinity;
		let maxLng = -Infinity;
		let maxLat = -Infinity;

		for (const post of postsToFit) {
			const ring = buildCircle(post.lng, post.lat, post.impactRadiusM).geometry.coordinates[0];
			for (const [lng, lat] of ring) {
				if (lng < minLng) minLng = lng;
				if (lng > maxLng) maxLng = lng;
				if (lat < minLat) minLat = lat;
				if (lat > maxLat) maxLat = lat;
			}
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

	export function focusOnLocation(
		lng: number,
		lat: number,
		radiusKm = 5,
		offset: [number, number] = [0, 0]
	) {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		const m = map as InstanceType<typeof ml.Map>;

		m.easeTo({
			center: [lng, lat],
			zoom: radiusKm <= 1 ? 13.4 : radiusKm <= 5 ? 12 : 10,
			offset,
			duration: 450
		});
		onMarkerPositionsChange();
	}

	export function triggerResize() {
		if (!map || !maplibre) return;
		const ml = maplibre as typeof import('maplibre-gl');
		(map as InstanceType<typeof ml.Map>).resize();
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
			attributionControl: false,
			canvasContextAttributes: { antialias: true }
		});

		m.addControl(new ml.AttributionControl({ compact: true }), 'bottom-left');
		m.addControl(
			new ml.NavigationControl({ visualizePitch: true, showCompass: true }),
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
			m.addSource('selected-verify-votes', {
				type: 'geojson',
				data: EMPTY_FEATURES
			});
			m.addLayer({
				id: 'selected-verify-heat',
				type: 'circle',
				source: 'selected-verify-votes',
				paint: {
					'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 20, 10, 34, 16, 52],
					'circle-color': '#16a34a',
					'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.14, 10, 0.2, 16, 0.26],
					'circle-blur': 0.88
				}
			});
			m.addSource('selected-dispute-votes', {
				type: 'geojson',
				data: EMPTY_FEATURES
			});
			m.addLayer({
				id: 'selected-dispute-heat',
				type: 'circle',
				source: 'selected-dispute-votes',
				paint: {
					'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 20, 10, 34, 16, 52],
					'circle-color': '#991b1b',
					'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.18, 10, 0.25, 16, 0.34],
					'circle-blur': 0.88
				}
			});
			m.addLayer({
				id: 'selected-verify-core',
				type: 'circle',
				source: 'selected-verify-votes',
				paint: {
					'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 8, 10, 12, 16, 18],
					'circle-color': '#16a34a',
					'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.12, 10, 0.18, 16, 0.24],
					'circle-blur': 0.52
				}
			});
			m.addLayer({
				id: 'selected-dispute-core',
				type: 'circle',
				source: 'selected-dispute-votes',
				paint: {
					'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 8, 10, 12, 16, 18],
					'circle-color': '#7f1d1d',
					'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.18, 10, 0.24, 16, 0.32],
					'circle-blur': 0.52
				}
			});
			m.addLayer({
				id: 'selected-radius-line',
				type: 'line',
				source: 'selected-radius',
				paint: { 'line-color': '#4f46e5', 'line-width': 2.4, 'line-opacity': 0.78 }
			});
			m.addSource('compose-radius', { type: 'geojson', data: EMPTY_FEATURES });
			m.addLayer({
				id: 'compose-radius-fill',
				type: 'fill',
				source: 'compose-radius',
				paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.16 }
			});
			m.addLayer({
				id: 'compose-radius-line',
				type: 'line',
				source: 'compose-radius',
				paint: {
					'line-color': '#d97706',
					'line-width': 2.2,
					'line-opacity': 0.82,
					'line-dasharray': [2, 1.4]
				}
			});
			m.addSource('posts', { type: 'geojson', data: postsToFeatures() });
			m.addLayer({
				id: 'post-point',
				type: 'circle',
				source: 'posts',
				paint: {
					'circle-radius': [
						'*',
						[
							'case',
							['==', ['get', 'selected'], true],
							9,
							['==', ['get', 'hovered'], true],
							8,
							6
						],
						['coalesce', ['get', 'scale'], 1]
					],
					'circle-color': [
						'match',
						['get', 'status'],
						'factual',
						'#16a34a',
						'disputed',
						'#dc2626',
						'decisive',
						'#eab308',
						'untouched',
						'#ffffff',
						'#111827'
					],
					'circle-opacity': 0.95,
					'circle-stroke-color': [
						'case',
						['==', ['get', 'status'], 'untouched'],
						'#111827',
						'#ffffff'
					],
					'circle-stroke-width': [
						'case',
						['==', ['get', 'selected'], true],
						3,
						2
					]
				}
			});
			m.addSource('compose-pin', { type: 'geojson', data: EMPTY_FEATURES });
			m.addLayer({
				id: 'compose-pin-halo',
				type: 'circle',
				source: 'compose-pin',
				paint: {
					'circle-radius': 15,
					'circle-color': '#fbbf24',
					'circle-opacity': 0.22
				}
			});
			m.addLayer({
				id: 'compose-pin',
				type: 'circle',
				source: 'compose-pin',
				paint: {
					'circle-radius': 7,
					'circle-color': '#f59e0b',
					'circle-opacity': 0.98,
					'circle-stroke-color': '#ffffff',
					'circle-stroke-width': 3
				}
			});

			hasLoaded = true;
			setMapMode(0);
			fitToBbox(NZ_BBOX);
			syncPostLayers();
			onMarkerPositionsChange();
			onMapReady(m);

			m.on('click', 'post-point', (e) => {
				if (composing || disableSelection) return;
				const id = e.features?.[0]?.properties?.id as string | undefined;
				const post = posts.find((item) => item.id === id);
				if (!post) return;
				skipNextBackgroundClick = true;
				onSelectPost(post.id);
			});

			m.on('click', (e) => {
				if (skipNextBackgroundClick) {
					skipNextBackgroundClick = false;
					return;
				}
				if (composing) {
					onComposePick?.(e.lngLat.lng, e.lngLat.lat);
					return;
				}
				if (disableSelection) return;
				const features = m.queryRenderedFeatures(e.point, { layers: ['post-point'] });
				if (features.length === 0) onSelectPost(null);
			});

			m.on('mouseenter', 'post-point', () => {
				m.getCanvas().style.cursor = composing ? 'crosshair' : 'pointer';
			});

			m.on('mouseleave', 'post-point', () => {
				m.getCanvas().style.cursor = composing ? 'crosshair' : '';
			});
		});

		m.on('move', onMarkerPositionsChange);
		m.on('zoom', onMarkerPositionsChange);
		m.on('resize', onMarkerPositionsChange);
	});

	onDestroy(() => {
		if (buildingRemoveTimer !== null) {
			window.clearTimeout(buildingRemoveTimer);
		}
		if (map && maplibre) {
			const ml = maplibre as typeof import('maplibre-gl');
			(map as InstanceType<typeof ml.Map>).remove();
		}
	});

	$effect(() => {
		posts;
		hoveredPostId;
		selectedPostId;
		selectedVotePoints;
		threeD;
		composing;
		composeLng;
		composeLat;
		composeRadiusM;
		disableSelection;
		showAllRadii;
		radiusPosts;
		syncPostLayers();
		if (map && maplibre) {
			const ml = maplibre as typeof import('maplibre-gl');
			(map as InstanceType<typeof ml.Map>).getCanvas().style.cursor = composing ? 'crosshair' : '';
		}
		if (hasLoaded && appliedThreeD !== threeD) setMapMode();
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
