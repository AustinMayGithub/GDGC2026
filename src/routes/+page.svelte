<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import HomeMap from '$lib/components/HomeMap.svelte';
	import HeadlineList from '$lib/components/HeadlineList.svelte';
	import ConnectorLines from '$lib/components/ConnectorLines.svelte';
	import TrendingDropdown from '$lib/components/TrendingDropdown.svelte';
	import CategoryPicker from '$lib/components/CategoryPicker.svelte';
	import HeaderImageCropper from '$lib/components/HeaderImageCropper.svelte';
	import type { SessionUser, PostSummary, PostCategory } from '$lib/types';
	import { NZ_BBOX, NZ_REGIONS, regionForPoint } from '$lib/data/nz-regions';
	import logo from '$lib/data/birdseye.png';

	interface PageData {
		user: SessionUser | null;
	}

	let { data }: { data: PageData } = $props();

	type Scope = 'national' | 'local';
	type CachedRegion = {
		regionId: string;
		timestamp: number;
	};
	type MapViewportState = {
		centerLng: number;
		centerLat: number;
		zoom: number;
		bounds: [number, number, number, number];
	};
	type RankedPost = {
		post: PostSummary;
		score: number;
		engagement: number;
	};

	const DEFAULT_REGION_ID = 'auckland';
	const REGION_CACHE_KEY = 'birdseye:local-region';
	const GEO_MAX_AGE_MS = 15 * 60 * 1000;
	const GEO_TIMEOUT_MS = 900;
	const LOCAL_FOCUS_RADIUS_KM = 2.5;
	const LOCAL_TRENDING_RADIUS_KM = 10;
	const LOCAL_AUTO_NATIONAL_ZOOM = 6.4;
	const LOCAL_AUTO_NATIONAL_GRACE_MS = 1400;
	const LOCAL_ZOOM_OUT_EPSILON = 0.05;
	const RADIUS_MIN_M = 100;
	const RADIUS_MAX_M = 50000;
	const RADIUS_SLIDER_MAX = 1000;
	const orderedRegions = [
		...NZ_REGIONS.filter((region) => region.id === DEFAULT_REGION_ID),
		...NZ_REGIONS.filter((region) => region.id !== DEFAULT_REGION_ID)
	];

	let scope = $state<Scope>('national');
	let posts = $state<PostSummary[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let hoveredPostId = $state<string | null>(null);
	let selectedPostId = $state<string | null>(null);

	let selectedRegionId = $state<string>(DEFAULT_REGION_ID);
	let localFocusLng = $state(174.76);
	let localFocusLat = $state(-36.85);
	let userLocation: { lng: number; lat: number } | null = $state(null);
	let geoError = $state<string | null>(null);
	let geoLoading = $state(false);

	let scrollHost: HTMLElement | null = null;
	let mapComponent: HomeMap | null = null;
	let mapReady = $state(false);
	let redrawTrigger = $state(0);
	let mapViewport = $state<MapViewportState | null>(null);
	let listItemEls = new Map<string, HTMLElement>();
	let trendingItemEls = new Map<string, HTMLElement>();
	let activeFetchController: AbortController | null = null;
	let fetchRequestId = 0;
	let geoRequestId = 0;
	let composing = $state(false);
	let composeTitle = $state('');
	let composeBody = $state('');
	let composeHeaderImageDataUrl = $state<string | null>(null);
	let composeCategory = $state<PostCategory | null>(null);
	let composeLng = $state(174.76);
	let composeLat = $state(-36.85);
	let composeRadiusM = $state(1000);
	let composeAnonymous = $state(false);
	let composeSubmitting = $state(false);
	let composeError = $state('');
	let trendingOpen = $state(false);
	let lastTrendingFitKey = '';
	let localAutoNationalEnabledAt = 0;
	let localPeakZoom: number | null = null;

	function toRadians(value: number) {
		return (value * Math.PI) / 180;
	}

	function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
		const earthRadiusKm = 6371;
		const latDelta = toRadians(bLat - aLat);
		const lngDelta = toRadians(bLng - aLng);
		const lat1 = toRadians(aLat);
		const lat2 = toRadians(bLat);
		const sinLat = Math.sin(latDelta / 2);
		const sinLng = Math.sin(lngDelta / 2);
		const haversine =
			sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
		return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
	}

	function regionCenter(regionId: string): [number, number] {
		return NZ_REGIONS.find((region) => region.id === regionId)?.center ?? [174.76, -36.85];
	}

	function setLocalFocus(lng: number, lat: number) {
		localFocusLng = lng;
		localFocusLat = lat;
	}

	function pauseLocalAutoNational() {
		localAutoNationalEnabledAt = Date.now() + LOCAL_AUTO_NATIONAL_GRACE_MS;
		localPeakZoom = null;
	}

	function applyUserLocation(lng: number, lat: number, focusMap: boolean) {
		const regionId = regionForPoint(lng, lat);
		userLocation = { lng, lat };
		selectedRegionId = regionId;
		writeCachedRegion(regionId);
		setLocalFocus(lng, lat);
		if (composing) {
			composeLng = lng;
			composeLat = lat;
		}

		if (focusMap && scope === 'local') {
			pauseLocalAutoNational();
			if (composing) {
				focusComposeLocation(lng, lat);
			} else {
				mapComponent?.focusOnLocation(lng, lat, LOCAL_FOCUS_RADIUS_KM);
			}
		}
	}

	function requestUserLocation(focusMap = false) {
		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			geoLoading = false;
			geoError = 'Geolocation not available, pick your region below.';
			return;
		}

		geoLoading = true;
		const requestId = ++geoRequestId;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				if (requestId !== geoRequestId) return;
				geoLoading = false;
				geoError = null;
				applyUserLocation(pos.coords.longitude, pos.coords.latitude, focusMap);
			},
			(err) => {
				if (requestId !== geoRequestId) return;
				geoLoading = false;
				geoError =
					err.code === err.PERMISSION_DENIED
						? 'Using your selected region below.'
						: 'Using a saved region for now.';

				if (focusMap && scope === 'local') {
					const [fallbackLng, fallbackLat] = regionCenter(selectedRegionId);
					setLocalFocus(fallbackLng, fallbackLat);
					pauseLocalAutoNational();
					if (composing) {
						focusComposeLocation(fallbackLng, fallbackLat);
					} else {
						mapComponent?.focusOnLocation(fallbackLng, fallbackLat, LOCAL_FOCUS_RADIUS_KM);
					}
				}
			},
			{
				enableHighAccuracy: false,
				maximumAge: GEO_MAX_AGE_MS,
				timeout: GEO_TIMEOUT_MS
			}
		);
	}

	function readCachedRegion(): string | null {
		if (typeof localStorage === 'undefined') return null;
		try {
			const raw = localStorage.getItem(REGION_CACHE_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw) as CachedRegion;
			return NZ_REGIONS.some((region) => region.id === parsed.regionId) ? parsed.regionId : null;
		} catch {
			return null;
		}
	}

	function writeCachedRegion(regionId: string) {
		if (typeof localStorage === 'undefined') return;
		try {
			const payload: CachedRegion = { regionId, timestamp: Date.now() };
			localStorage.setItem(REGION_CACHE_KEY, JSON.stringify(payload));
		} catch {
			// Ignore storage failures and keep the UI moving.
		}
	}

	function popularityScore(post: PostSummary): number {
		const ageHours = Math.max((Date.now() - new Date(post.createdAt).getTime()) / 36e5, 0);
		const voteTotal = post.verifyCount + post.disputeCount;
		const approval = voteTotal === 0 ? 0.5 : post.verifyCount / voteTotal;
		const engagement =
			post.commentCount * 5 +
			post.reactionCount * 3 +
			post.verifyCount * 2 +
			post.disputeCount;
		const freshnessBoost = 18 / (ageHours + 6);
		return engagement * (0.7 + approval * 0.6) + freshnessBoost;
	}

	function engagementFor(post: PostSummary): number {
		const votes = post.verifyCount + post.disputeCount;
		return post.commentCount * 4 + post.reactionCount * 3 + votes * 2;
	}

	function trendScore(post: PostSummary): number {
		const engagement = engagementFor(post);
		const ageHours = Math.max((Date.now() - new Date(post.createdAt).getTime()) / 36e5, 0);
		return Math.round((engagement * 100) / Math.max(ageHours + 2, 2));
	}

	const rankedPosts = $derived.by(() => {
		return [...posts].sort((a, b) => {
			const diff = popularityScore(b) - popularityScore(a);
			if (Math.abs(diff) > 0.001) return diff;
			return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
		});
	});

	const visiblePosts = $derived(rankedPosts);
	const trendingEntries = $derived.by(() => {
		const trendingSource =
			scope === 'local'
				? visiblePosts.filter(
						(post) =>
							distanceKm(localFocusLat, localFocusLng, post.lat, post.lng) <=
							LOCAL_TRENDING_RADIUS_KM
					)
				: visiblePosts;
		const entries: RankedPost[] = trendingSource
			.map((post) => ({
				post,
				score: trendScore(post),
				engagement: engagementFor(post)
			}))
			.filter((entry) => entry.engagement > 0)
			.sort((a, b) => b.score - a.score || b.engagement - a.engagement);

		return entries.slice(0, 6);
	});
	const trendingPosts = $derived(trendingEntries.map((entry) => entry.post));
	const selectedPosts = $derived(
		!trendingOpen && selectedPostId
			? visiblePosts.filter((post) => post.id === selectedPostId)
			: []
	);
	const canSubmitPost = $derived(
		Boolean(data.user) &&
			composeTitle.trim().length >= 4 &&
			composeBody.trim().length >= 10 &&
			composeCategory !== null &&
			!composeSubmitting
	);
	const mapPosts = $derived(visiblePosts);
	const connectorPosts = $derived(trendingOpen ? trendingPosts : selectedPosts);
	const connectorEls = $derived(trendingOpen ? trendingItemEls : listItemEls);
	const scrollSpacerHeight = $derived(0);

	function resetFeedVisibility() {
		scrollHost?.scrollTo({ top: 0, behavior: 'auto' });
	}

	function clearSelectedPost() {
		selectedPostId = null;
		hoveredPostId = null;
		redrawTrigger++;
	}

	async function fetchPosts() {
		const requestId = ++fetchRequestId;
		activeFetchController?.abort();
		const controller = new AbortController();
		activeFetchController = controller;
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/posts?scope=national', { signal: controller.signal });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			if (requestId !== fetchRequestId) return;
			posts = json.posts as PostSummary[];
			if (selectedPostId && !posts.some((post) => post.id === selectedPostId)) {
				selectedPostId = null;
				hoveredPostId = null;
			}
			resetFeedVisibility();
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (requestId !== fetchRequestId) return;
			error = 'Failed to load posts. Please try again.';
			posts = [];
			resetFeedVisibility();
		} finally {
			if (requestId === fetchRequestId) {
				loading = false;
				activeFetchController = null;
			}
		}
	}

	async function switchToNational() {
		clearSelectedPost();
		scope = 'national';
		geoLoading = false;
		geoError = null;
		mapComponent?.fitToBbox(NZ_BBOX);
	}

	async function switchToLocal() {
		clearSelectedPost();
		scope = 'local';
		geoError = null;

		if (userLocation) {
			setLocalFocus(userLocation.lng, userLocation.lat);
			pauseLocalAutoNational();
			mapComponent?.focusOnLocation(userLocation.lng, userLocation.lat, LOCAL_FOCUS_RADIUS_KM);
		} else {
			requestUserLocation(true);
		}
	}

	function zoomToRegion(regionId: string) {
		const region = NZ_REGIONS.find((r) => r.id === regionId);
		if (region && mapComponent) {
			setLocalFocus(region.center[0], region.center[1]);
			pauseLocalAutoNational();
			mapComponent.fitToBbox(region.bbox);
		}
	}

	function onRegionChange(e: Event) {
		clearSelectedPost();
		selectedRegionId = (e.target as HTMLSelectElement).value;
		writeCachedRegion(selectedRegionId);
		scope = 'local';
		zoomToRegion(selectedRegionId);
	}

	function handleMapReady(_map: unknown) {
		mapReady = true;
		mapViewport = mapComponent?.getViewportState() ?? null;
		redrawTrigger++;
	}

	function handleMarkerPositionsChange() {
		mapViewport = mapComponent?.getViewportState() ?? mapViewport;
		if (scope === 'local' && !trendingOpen && mapViewport && Date.now() >= localAutoNationalEnabledAt) {
			if (localPeakZoom === null || mapViewport.zoom > localPeakZoom) {
				localPeakZoom = mapViewport.zoom;
			} else if (
				mapViewport.zoom < LOCAL_AUTO_NATIONAL_ZOOM ||
				mapViewport.zoom < localPeakZoom - LOCAL_ZOOM_OUT_EPSILON
			) {
				scope = 'national';
				geoLoading = false;
				geoError = null;
				localPeakZoom = null;
				clearSelectedPost();
			}
		}
		redrawTrigger++;
	}

	function getMarkerScreenPos(id: string): { x: number; y: number } | null {
		return mapComponent?.getMarkerScreenPos(id) ?? null;
	}

	function handleSelectPost(id: string | null) {
		if (trendingOpen) {
			trendingOpen = false;
			lastTrendingFitKey = '';
		}
		selectedPostId = id;
		hoveredPostId = id;
		redrawTrigger++;
	}

	function formatRadius(m: number): string {
		if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
		return `${m} m`;
	}

	function sliderToRadius(value: number): number {
		const t = Math.min(Math.max(value, 0), RADIUS_SLIDER_MAX) / RADIUS_SLIDER_MAX;
		const raw = RADIUS_MIN_M * Math.pow(RADIUS_MAX_M / RADIUS_MIN_M, t);
		const step = raw < 1000 ? 25 : raw < 10000 ? 100 : 500;
		return Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, Math.round(raw / step) * step));
	}

	function radiusToSlider(radiusM: number): number {
		const clamped = Math.min(Math.max(radiusM, RADIUS_MIN_M), RADIUS_MAX_M);
		const t = Math.log(clamped / RADIUS_MIN_M) / Math.log(RADIUS_MAX_M / RADIUS_MIN_M);
		return Math.round(t * RADIUS_SLIDER_MAX);
	}

	async function resizeMapAfterLayout() {
		await tick();
		mapComponent?.triggerResize();
		setTimeout(() => mapComponent?.triggerResize(), 320);
	}

	function composeMapOffset(): [number, number] {
		if (typeof window === 'undefined' || window.innerWidth <= 980) return [0, 0];
		const panelWidth = Math.max(520, Math.min(760, window.innerWidth * 0.58 - 20));
		return [-(panelWidth + 20) / 2, 0];
	}

	function focusComposeLocation(lng: number, lat: number) {
		mapComponent?.focusOnLocation(lng, lat, LOCAL_FOCUS_RADIUS_KM, composeMapOffset());
	}

	function openCompose() {
		const target = userLocation ?? { lng: localFocusLng, lat: localFocusLat };
		composeLng = target.lng;
		composeLat = target.lat;

		if (!userLocation) {
			requestUserLocation(true);
		}
		scope = 'local';
		clearSelectedPost();
		trendingOpen = false;
		lastTrendingFitKey = '';
		pauseLocalAutoNational();
		scrollHost?.scrollTo({ top: 0, behavior: 'auto' });
		composing = true;
		void resizeMapAfterLayout();
		void tick().then(() => focusComposeLocation(target.lng, target.lat));
	}

	function closeCompose() {
		composing = false;
		composeError = '';
		scrollHost?.scrollTo({ top: 0, behavior: 'auto' });
		void resizeMapAfterLayout();
	}

	function handleComposePick(newLng: number, newLat: number) {
		composeLng = newLng;
		composeLat = newLat;
		focusComposeLocation(newLng, newLat);
	}

	function handleRadiusInput(e: Event) {
		composeRadiusM = sliderToRadius(Number((e.currentTarget as HTMLInputElement).value));
	}

	function handleComposeCategory(cat: PostCategory) {
		composeCategory = cat;
	}

	function handleHeaderImage(dataUrl: string | null) {
		composeHeaderImageDataUrl = dataUrl;
	}

	async function handleComposeSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmitPost || composeCategory === null) return;

		composeSubmitting = true;
		composeError = '';

		try {
			const res = await fetch('/api/posts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: composeTitle.trim(),
					body: composeBody.trim(),
					headerImageDataUrl: composeHeaderImageDataUrl,
					category: composeCategory,
					anonymous: composeAnonymous,
					lng: composeLng,
					lat: composeLat,
					impactRadiusM: composeRadiusM
				})
			});

			const json = await res.json().catch(() => ({}));
			if (!res.ok) {
				composeError = json.message ?? 'Failed to create post. Please try again.';
				return;
			}

			await goto(`/post/${json.id}`);
		} catch {
			composeError = 'Network error. Please check your connection and try again.';
		} finally {
			composeSubmitting = false;
		}
	}

	function handleTrendingOpenChange(open: boolean) {
		trendingOpen = open;
		if (open) {
			clearSelectedPost();
		} else {
			hoveredPostId = null;
			lastTrendingFitKey = '';
			redrawTrigger++;
		}
	}

	onMount(() => {
		const cachedRegionId = readCachedRegion();
		if (cachedRegionId) {
			selectedRegionId = cachedRegionId;
		}
		const [cachedLng, cachedLat] = regionCenter(selectedRegionId);
		setLocalFocus(cachedLng, cachedLat);
		requestUserLocation(false);
		fetchPosts();
	});

	onDestroy(() => {
		activeFetchController?.abort();
	});

	$effect(() => {
		posts;
		mapReady;
		redrawTrigger;
	});

	$effect(() => {
		if (!trendingOpen || !mapReady || trendingPosts.length === 0) return;
		const fitKey = trendingPosts.map((post) => post.id).join('|');
		if (fitKey === lastTrendingFitKey) return;
		lastTrendingFitKey = fitKey;
		clearSelectedPost();
		mapComponent?.fitToPosts(trendingPosts);
		redrawTrigger++;
	});
</script>

<div class="page" class:composing>
	<header class="header card">
		<div
			class="logo"
			onclick={() => goto('/')}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Enter' && goto('/')}
		>
			<img alt="logo" src={logo} height="24px">
			
		</div>

		<div class="header-center">
			<div
				class="scope-toggle"
				class:local={scope === 'local'}
				class:switching={loading}
				aria-busy={loading}
			>
				<span class="toggle-indicator" aria-hidden="true"></span>
				<button
					type="button"
					class={scope === 'national' ? 'toggle-btn active' : 'toggle-btn'}
					onclick={switchToNational}
					aria-pressed={scope === 'national'}
					disabled={loading}
				>
					National
				</button>
				<button
					type="button"
					class={scope === 'local' ? 'toggle-btn active' : 'toggle-btn'}
					onclick={switchToLocal}
					aria-pressed={scope === 'local'}
					disabled={loading}
				>
					Local
				</button>
			</div>

			{#if scope === 'local'}
				<div class="region-controls">
					{#if geoLoading}
						<span class="muted helper-text">Detecting location...</span>
					{/if}
					{#if geoError}
						<span class="error-text helper-text">{geoError}</span>
					{/if}
					<select class="input region-select" value={selectedRegionId} onchange={onRegionChange}>
						{#each orderedRegions as region (region.id)}
							<option value={region.id}>{region.name}</option>
						{/each}
					</select>
				</div>
			{/if}
		</div>

		<div class="header-right">
			<button type="button" class="btn btn-primary new-post-btn" onclick={openCompose}>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
				New post
			</button>
			<UserMenu user={data.user} />
		</div>
	</header>

	<main class="main" bind:this={scrollHost}>
		<div class="map-area">
			{#if loading}
				<div class="map-loading" aria-live="polite">
					<div class="spinner"></div>
				</div>
			{/if}

			<HomeMap
				bind:this={mapComponent}
				posts={mapPosts}
				{hoveredPostId}
				{selectedPostId}
				showAllRadii={trendingOpen}
				radiusPosts={trendingPosts}
				onMapReady={handleMapReady}
				onMarkerPositionsChange={handleMarkerPositionsChange}
				onSelectPost={handleSelectPost}
				{composing}
				{composeLng}
				{composeLat}
				composeRadiusM={composeRadiusM}
				onComposePick={handleComposePick}
			/>

			{#if !composing}
				<div class="trending-overlay">
					<TrendingDropdown
						entries={trendingEntries}
						{scope}
						open={trendingOpen}
						onOpenChange={handleTrendingOpenChange}
						itemEls={trendingItemEls}
						onItemsChange={() => redrawTrigger++}
					/>
				</div>

				<HeadlineList
					posts={selectedPosts}
					{hoveredPostId}
					onHover={(id) => {
						hoveredPostId = id;
						redrawTrigger++;
					}}
					{listItemEls}
				/>
			{/if}

			{#if rankedPosts.length === 0 && !loading && !composing}
				<div class="empty-state card">
					<div class="empty-icon">📍</div>
					<h2 class="empty-title">No posts here yet</h2>
					<p class="muted empty-body">Be the first to share what's happening in your community.</p>
					<button type="button" class="btn btn-primary" onclick={openCompose}>Create a post</button>
				</div>
			{/if}

			{#if error}
				<div class="error-banner card">
					<span class="error-text">{error}</span>
					<button class="btn" onclick={() => fetchPosts()} style="font-size:12px;padding:6px 12px;">
						Retry
					</button>
				</div>
			{/if}
		</div>
		<div class="feed-scroll-space" aria-hidden="true" style={`height: ${scrollSpacerHeight}px;`}></div>

		{#if composing}
			<aside class="compose-panel card" transition:fly={{ x: 80, duration: 260 }}>
				{#if !data.user}
					<div class="compose-gate">
						<div>
							<h1 class="compose-title">Share something with your community</h1>
							<p class="muted compose-sub">You need to sign in before creating a post.</p>
						</div>
						<a class="btn btn-primary" href="/auth/login">Sign in to post</a>
						<button type="button" class="btn" onclick={closeCompose}>Back to map</button>
					</div>
				{:else}
					<form class="compose-form" onsubmit={handleComposeSubmit}>
						<div class="compose-top">
							<div>
								<h1 class="compose-title">New post</h1>
								<p class="muted compose-sub">Click the map to place the pin and set the affected area.</p>
							</div>
							<button type="button" class="close-btn" aria-label="Close new post" onclick={closeCompose}>
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
									<path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
								</svg>
							</button>
						</div>

						<div class="field">
							<span class="field-label">Header image</span>
							<HeaderImageCropper disabled={composeSubmitting} onimagechange={handleHeaderImage} />
							<span class="field-hint muted">Optional. Cropped wide for the post header.</span>
						</div>

						<div class="field">
							<label class="field-label" for="post-title">Title</label>
							<input
								id="post-title"
								class="input"
								type="text"
								placeholder="What happened? Keep it brief."
								bind:value={composeTitle}
								maxlength={140}
								disabled={composeSubmitting}
								required
							/>
							<span class="field-hint muted">{composeTitle.length}/140</span>
						</div>

						<div class="field">
							<label class="field-label" for="post-body">Details</label>
							<textarea
								id="post-body"
								class="input body-input"
								placeholder="Describe what you saw or want to share..."
								bind:value={composeBody}
								rows={7}
								disabled={composeSubmitting}
								required
							></textarea>
						</div>

						<div class="field">
							<span class="field-label">Category</span>
							<CategoryPicker value={composeCategory} onchange={handleComposeCategory} />
						</div>

						<label class="anon-row">
							<input
								type="checkbox"
								bind:checked={composeAnonymous}
								disabled={composeSubmitting}
								class="anon-check"
							/>
							<span class="anon-text">
								Post anonymously
								<span class="field-hint muted">your name will not be shown publicly</span>
							</span>
						</label>

						<div class="location-panel">
							<div class="radius-label-row">
								<label class="field-label" for="radius-slider">Affected location</label>
								<span class="radius-value">{formatRadius(composeRadiusM)}</span>
							</div>
							<input
								id="radius-slider"
								type="range"
								class="radius-slider"
								min={0}
								max={RADIUS_SLIDER_MAX}
								step={1}
								value={radiusToSlider(composeRadiusM)}
								oninput={handleRadiusInput}
							/>
							<div class="radius-hints muted">
								<span>100 m</span>
								<span>50 km</span>
							</div>
							<div class="coords-row muted">
								<span>{composeLat.toFixed(4)}°, {composeLng.toFixed(4)}°</span>
							</div>
						</div>

						{#if composeError}
							<p class="error-text error-msg">{composeError}</p>
						{/if}

						<div class="submit-row">
							<button type="submit" class="btn btn-primary submit-btn" disabled={!canSubmitPost}>
								{composeSubmitting ? 'Posting...' : 'Publish post'}
							</button>
							<button type="button" class="btn cancel-btn" onclick={closeCompose}>Cancel</button>
						</div>
					</form>
				{/if}
			</aside>
		{/if}
	</main>

	{#if mapReady && !composing}
		<ConnectorLines
			posts={connectorPosts}
			{hoveredPostId}
			{getMarkerScreenPos}
			listItemEls={connectorEls}
			{redrawTrigger}
			arrowheads={trendingOpen}
		/>
	{/if}
</div>

<style>
	.page {
		height: 100vh;
		overflow: hidden;
		background: var(--bg);
		position: relative;
	}

	.header {
		position: absolute;
		top: 18px;
		left: 20px;
		right: 20px;
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 0 16px;
		height: 64px;
		border-radius: var(--radius-lg);
		border: 1px solid rgba(255, 255, 255, 0.72);
		z-index: 22;
		background: rgba(255, 255, 255, 0.82);
		backdrop-filter: blur(18px);
		box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		flex-shrink: 0;
	}

	.logo-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--gradient);
		flex-shrink: 0;
	}

	.logo-name {
		font-size: 18px;
		font-weight: 750;
		letter-spacing: -0.02em;
	}

	.header-center {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.scope-toggle {
		display: grid;
		grid-template-columns: 1fr 1fr;
		position: relative;
		background: rgba(247, 247, 249, 0.8);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 3px;
		gap: 2px;
		min-width: 194px;
		overflow: hidden;
	}

	.toggle-indicator {
		position: absolute;
		top: 3px;
		left: 3px;
		width: calc(50% - 4px);
		height: calc(100% - 6px);
		border-radius: calc(var(--radius-sm) - 2px);
		background: rgba(255, 255, 255, 0.92);
		box-shadow: var(--shadow-sm);
		transition: transform 0.2s ease;
		pointer-events: none;
	}

	.scope-toggle.local .toggle-indicator {
		transform: translateX(calc(100% + 2px));
	}

	.scope-toggle.switching {
		opacity: 0.86;
	}

	.toggle-btn {
		padding: 5px 16px;
		border-radius: calc(var(--radius-sm) - 2px);
		border: none;
		background: transparent;
		color: var(--text-2);
		font-size: 13px;
		font-weight: 550;
		transition: color 0.15s ease, transform 0.15s ease;
		position: relative;
		z-index: 1;
	}

	.toggle-btn.active {
		color: var(--text);
		font-weight: 700;
	}

	.toggle-btn:not(.active):hover:enabled {
		color: var(--text);
	}

	.toggle-btn:enabled:active {
		transform: translateY(1px);
	}

	.toggle-btn:disabled {
		cursor: wait;
	}

	.region-controls {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.region-select {
		width: auto;
		padding: 5px 10px;
		font-size: 13px;
	}

	.helper-text {
		font-size: 12px;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	.new-post-btn {
		font-size: 13px;
		padding: 7px 14px;
	}

	.main {
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		position: relative;
	}

	.page.composing .main {
		display: block;
		overflow: hidden;
		padding: 0;
	}

	.map-area {
		position: sticky;
		top: 0;
		overflow: hidden;
		height: 100vh;
	}

	.page.composing .map-area {
		position: absolute;
		inset: 0;
		height: 100vh;
	}

	.feed-scroll-space {
		width: 100%;
	}

	.page.composing .feed-scroll-space {
		display: none;
	}

	.map-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 20;
		background: rgba(255, 255, 255, 0.38);
		backdrop-filter: blur(4px);
		pointer-events: none;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--border);
		border-top-color: var(--brand-1);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.trending-overlay {
		position: absolute;
		top: 96px;
		left: 18px;
		width: min(320px, calc(100vw - 36px));
		z-index: 20;
	}

	.empty-state {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 32px 20px;
		gap: 12px;
		width: min(420px, calc(100vw - 40px));
		z-index: 20;
		background: rgba(255, 255, 255, 0.88);
		backdrop-filter: blur(14px);
	}

	.empty-icon {
		font-size: 32px;
		line-height: 1;
	}

	.empty-title {
		font-size: 16px;
	}

	.empty-body {
		font-size: 13px;
		margin: 0;
		max-width: 220px;
	}

	.error-banner {
		position: absolute;
		left: 50%;
		bottom: 20px;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 14px;
		z-index: 21;
		background: rgba(255, 255, 255, 0.94);
	}

	.compose-panel {
		position: absolute;
		top: 96px;
		right: 20px;
		bottom: 20px;
		z-index: 18;
		width: min(760px, calc(58vw - 20px));
		min-width: 520px;
		margin: 0;
		padding: 24px;
		overflow-y: auto;
		background: rgba(255, 255, 255, 0.94);
		backdrop-filter: blur(18px);
		border-radius: var(--radius-lg);
		box-shadow: 0 18px 44px rgba(15, 23, 42, 0.12);
	}

	.compose-form,
	.compose-gate {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 760px;
		margin: 0 auto;
	}

	.compose-gate {
		min-height: 360px;
		justify-content: center;
		align-items: flex-start;
	}

	.compose-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.compose-title {
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -0.01em;
	}

	.compose-sub {
		margin: 4px 0 0;
		font-size: 14px;
	}

	.close-btn {
		width: 34px;
		height: 34px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-2);
		flex-shrink: 0;
	}

	.close-btn:hover {
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: 12px;
		font-weight: 700;
		color: var(--text-2);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.field-hint {
		font-size: 11px;
	}

	.body-input {
		min-height: 168px;
		resize: vertical;
	}

	.anon-row {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 550;
	}

	.anon-check {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		accent-color: var(--accent);
	}

	.anon-text {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}

	.location-panel {
		display: flex;
		flex-direction: column;
		gap: 9px;
		padding: 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-2);
	}

	.radius-label-row,
	.radius-hints {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}

	.radius-value {
		font-size: 16px;
		font-weight: 800;
		color: #92400e;
	}

	.radius-slider {
		width: 100%;
		accent-color: #d97706;
		cursor: pointer;
	}

	.radius-hints,
	.coords-row {
		font-size: 11px;
	}

	.coords-row {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	}

	.error-msg {
		margin: 0;
		font-size: 13px;
	}

	.submit-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-bottom: 4px;
	}

	.submit-btn {
		flex: 1;
		padding: 12px 16px;
		font-weight: 750;
	}

	.cancel-btn {
		padding: 12px 18px;
	}

	@media (max-width: 980px) {
		.header {
			top: 12px;
			left: 12px;
			right: 12px;
			height: auto;
			padding: 12px 14px;
			flex-wrap: wrap;
		}

		.header-center {
			order: 3;
			width: 100%;
			justify-content: flex-start;
		}

		.trending-overlay {
			top: 132px;
			left: 12px;
			width: min(320px, calc(100vw - 24px));
		}

		.error-banner {
			width: calc(100vw - 24px);
		}

		.page.composing .main {
			display: block;
			overflow: hidden;
			padding: 0;
		}

		.page.composing .map-area {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100vh;
		}

		.compose-panel {
			top: 154px;
			left: 12px;
			right: 12px;
			bottom: 16px;
			width: auto;
			min-width: 0;
		}
	}

	@media (max-width: 820px) {
		.trending-overlay {
			position: absolute;
			top: auto;
			left: 12px;
			right: 12px;
			bottom: 84px;
			width: auto;
		}
	}

	@media (max-width: 720px) {
		.header-right {
			width: 100%;
			justify-content: space-between;
		}

		.compose-panel {
			padding: 18px;
		}

		.submit-row {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
