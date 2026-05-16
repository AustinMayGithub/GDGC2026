<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import HomeMap from '$lib/components/HomeMap.svelte';
	import HeadlineList from '$lib/components/HeadlineList.svelte';
	import ConnectorLines from '$lib/components/ConnectorLines.svelte';
	import TrendingDropdown from '$lib/components/TrendingDropdown.svelte';
	import type { SessionUser, PostSummary } from '$lib/types';
	import { NZ_BBOX, NZ_REGIONS, regionForPoint } from '$lib/data/nz-regions';

	interface PageData {
		user: SessionUser | null;
	}

	let { data }: { data: PageData } = $props();

	type Scope = 'national' | 'local';
	type CachedRegion = {
		regionId: string;
		timestamp: number;
	};

	const DEFAULT_REGION_ID = 'auckland';
	const REGION_CACHE_KEY = 'birdseye:local-region';
	const GEO_MAX_AGE_MS = 10 * 60 * 1000;
	const LOCAL_FOCUS_RADIUS_KM = 5;
	const INITIAL_VISIBLE_POSTS = 18;
	const POSTS_PER_SCROLL_STEP = 10;
	const SCROLL_STEP_PX = 220;
	const DESKTOP_BUBBLE_BREAKPOINT = 820;
	const COMPACT_BUBBLE_BREAKPOINT = 1100;
	const MIN_BUBBLES_PER_RAIL = 2;
	const BUBBLE_ASPECT_RATIO = 1.32;
	const BUBBLE_GAP_PX = 18;
	const orderedRegions = [
		...NZ_REGIONS.filter((region) => region.id === DEFAULT_REGION_ID),
		...NZ_REGIONS.filter((region) => region.id !== DEFAULT_REGION_ID)
	];

	let scope = $state<Scope>('national');
	let posts = $state<PostSummary[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let hoveredPostId = $state<string | null>(null);
	let visibleCount = $state(INITIAL_VISIBLE_POSTS);

	let selectedRegionId = $state<string>(DEFAULT_REGION_ID);
	let geoError = $state<string | null>(null);
	let geoLoading = $state(false);

	let scrollHost: HTMLElement | null = null;
	let mapComponent: HomeMap | null = null;
	let mapReady = $state(false);
	let redrawTrigger = $state(0);
	let viewportWidth = $state(1440);
	let viewportHeight = $state(900);
	let listItemEls = new Map<string, HTMLElement>();
	let activeFetchController: AbortController | null = null;
	let fetchRequestId = 0;
	let geoRequestId = 0;

	function clamp(min: number, value: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}

	function currentBubbleRailWidth() {
		if (viewportWidth <= DESKTOP_BUBBLE_BREAKPOINT) return 0;
		if (viewportWidth <= COMPACT_BUBBLE_BREAKPOINT) {
			return clamp(164, viewportWidth * 0.2, 236);
		}
		return clamp(180, viewportWidth * 0.18, 272);
	}

	function maxHomepagePostsForViewport() {
		if (viewportWidth <= DESKTOP_BUBBLE_BREAKPOINT) return INITIAL_VISIBLE_POSTS;

		const stageTop = viewportWidth <= COMPACT_BUBBLE_BREAKPOINT ? 118 : 110;
		const stageBottom = viewportWidth <= COMPACT_BUBBLE_BREAKPOINT ? 18 : 22;
		const availableHeight = Math.max(viewportHeight - stageTop - stageBottom, 0);
		const cardWidth = currentBubbleRailWidth();
		if (!cardWidth || availableHeight <= 0) return MIN_BUBBLES_PER_RAIL * 2;

		const cardHeight = cardWidth / BUBBLE_ASPECT_RATIO;
		const slotHeight = cardHeight + BUBBLE_GAP_PX;
		const slotsPerRail = Math.max(MIN_BUBBLES_PER_RAIL, Math.floor(availableHeight / slotHeight));
		return slotsPerRail * 2;
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

	const rankedPosts = $derived.by(() =>
		[...posts].sort((a, b) => {
			const diff = popularityScore(b) - popularityScore(a);
			if (Math.abs(diff) > 0.001) return diff;
			return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
		})
	);

	const maxHomepagePosts = $derived(maxHomepagePostsForViewport());
	const feedCapacity = $derived(Math.min(rankedPosts.length, maxHomepagePosts));
	const visiblePosts = $derived(rankedPosts.slice(0, Math.min(visibleCount, feedCapacity)));
	const hiddenPostCount = $derived(Math.max(feedCapacity - visiblePosts.length, 0));
	const scrollSpacerHeight = $derived(
		hiddenPostCount === 0 ? 0 : Math.ceil(hiddenPostCount / POSTS_PER_SCROLL_STEP) * SCROLL_STEP_PX
	);

	function resetFeedVisibility() {
		visibleCount = Math.min(INITIAL_VISIBLE_POSTS, maxHomepagePosts);
		scrollHost?.scrollTo({ top: 0, behavior: 'auto' });
	}

	function handleFeedScroll() {
		if (!scrollHost) return;
		const extraSteps = Math.floor(scrollHost.scrollTop / SCROLL_STEP_PX);
		const nextVisible = Math.min(
			feedCapacity,
			INITIAL_VISIBLE_POSTS + extraSteps * POSTS_PER_SCROLL_STEP
		);
		if (nextVisible !== visibleCount) visibleCount = nextVisible;
	}

	async function fetchPosts(scopeToFetch: Scope = scope, regionId = selectedRegionId) {
		const requestId = ++fetchRequestId;
		activeFetchController?.abort();
		const controller = new AbortController();
		activeFetchController = controller;
		loading = true;
		error = null;
		try {
			const url =
				scopeToFetch === 'national'
					? '/api/posts?scope=national'
					: `/api/posts?scope=local&regionId=${regionId}`;
			const res = await fetch(url, { signal: controller.signal });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			if (requestId !== fetchRequestId) return;
			posts = json.posts as PostSummary[];
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
		scope = 'national';
		geoLoading = false;
		geoError = null;
		mapComponent?.fitToBbox(NZ_BBOX);
		await fetchPosts('national');
	}

	async function switchToLocal() {
		scope = 'local';
		geoError = null;
		zoomToRegion(selectedRegionId);
		void fetchPosts('local', selectedRegionId);

		if (typeof navigator !== 'undefined' && navigator.geolocation) {
			geoLoading = true;
			const requestId = ++geoRequestId;
			navigator.geolocation.getCurrentPosition(
				(pos) => {
					if (requestId !== geoRequestId || scope !== 'local') return;
					const regionId = regionForPoint(pos.coords.longitude, pos.coords.latitude);
					const changedRegion = regionId !== selectedRegionId;
					selectedRegionId = regionId;
					writeCachedRegion(regionId);
					geoLoading = false;
					geoError = null;
					mapComponent?.focusOnLocation(
						pos.coords.longitude,
						pos.coords.latitude,
						LOCAL_FOCUS_RADIUS_KM
					);
					if (changedRegion) {
						void fetchPosts('local', regionId);
					}
				},
				(err) => {
					if (requestId !== geoRequestId || scope !== 'local') return;
					geoLoading = false;
					geoError =
						err.code === err.PERMISSION_DENIED
							? 'Using your selected region below.'
							: 'Using a saved region for now.';
				},
				{
					enableHighAccuracy: false,
					maximumAge: GEO_MAX_AGE_MS,
					timeout: 2500
				}
			);
		} else {
			geoLoading = false;
			geoError = 'Geolocation not available, pick your region below.';
		}
	}

	function zoomToRegion(regionId: string) {
		const region = NZ_REGIONS.find((r) => r.id === regionId);
		if (region && mapComponent) {
			mapComponent.fitToBbox(region.bbox);
		}
	}

	async function onRegionChange(e: Event) {
		selectedRegionId = (e.target as HTMLSelectElement).value;
		writeCachedRegion(selectedRegionId);
		zoomToRegion(selectedRegionId);
		await fetchPosts('local', selectedRegionId);
	}

	function handleMapReady(_map: unknown) {
		mapReady = true;
		redrawTrigger++;
	}

	function handleMarkerPositionsChange() {
		redrawTrigger++;
	}

	function getMarkerScreenPos(id: string): { x: number; y: number } | null {
		return mapComponent?.getMarkerScreenPos(id) ?? null;
	}

	onMount(() => {
		const syncViewport = () => {
			viewportWidth = window.innerWidth;
			viewportHeight = window.innerHeight;
		};

		syncViewport();
		window.addEventListener('resize', syncViewport);

		const cachedRegionId = readCachedRegion();
		if (cachedRegionId) {
			selectedRegionId = cachedRegionId;
		}
		fetchPosts();

		return () => {
			window.removeEventListener('resize', syncViewport);
		};
	});

	onDestroy(() => {
		activeFetchController?.abort();
	});

	$effect(() => {
		posts;
		mapReady;
		redrawTrigger;
	});
</script>

<div class="page">
	<header class="header card">
		<div
			class="logo"
			onclick={() => goto('/')}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Enter' && goto('/')}
		>
			<span class="logo-dot"></span>
			<span class="logo-name gradient-text">BirdsEye</span>
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
			<a href="/compose" class="btn btn-primary new-post-btn">
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
				New post
			</a>
			<UserMenu user={data.user} />
		</div>
	</header>

	<main class="main" bind:this={scrollHost} onscroll={handleFeedScroll}>
		<div class="map-area">
			{#if loading}
				<div class="map-loading" aria-live="polite">
					<div class="spinner"></div>
				</div>
			{/if}

			<HomeMap
				bind:this={mapComponent}
				posts={visiblePosts}
				{hoveredPostId}
				onMapReady={handleMapReady}
				onMarkerPositionsChange={handleMarkerPositionsChange}
			/>

			<div class="trending-overlay">
				<TrendingDropdown posts={visiblePosts} {scope} />
			</div>

			<HeadlineList
				posts={visiblePosts}
				{hoveredPostId}
				onHover={(id) => {
					hoveredPostId = id;
					redrawTrigger++;
				}}
				{listItemEls}
			/>

			{#if rankedPosts.length === 0 && !loading}
				<div class="empty-state card">
					<div class="empty-icon">📍</div>
					<h2 class="empty-title">No posts here yet</h2>
					<p class="muted empty-body">Be the first to share what's happening in your community.</p>
					<a href="/compose" class="btn btn-primary">Create a post</a>
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
	</main>

	{#if mapReady}
		<ConnectorLines
			posts={visiblePosts}
			{hoveredPostId}
			{getMarkerScreenPos}
			{listItemEls}
			{redrawTrigger}
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

	.map-area {
		position: sticky;
		top: 0;
		overflow: hidden;
		height: 100vh;
	}

	.feed-scroll-space {
		width: 100%;
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
	}
</style>
