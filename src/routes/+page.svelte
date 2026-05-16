<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import HomeMap from '$lib/components/HomeMap.svelte';
	import HeadlineList from '$lib/components/HeadlineList.svelte';
	import ConnectorLines from '$lib/components/ConnectorLines.svelte';
	import type { SessionUser, PostSummary } from '$lib/types';
	import { NZ_BBOX, NZ_REGIONS, regionForPoint } from '$lib/data/nz-regions';

	interface PageData {
		user: SessionUser | null;
	}

	let { data }: { data: PageData } = $props();

	// --- State ---
	type Scope = 'national' | 'local';
	let scope = $state<Scope>('national');
	let posts = $state<PostSummary[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let hoveredPostId = $state<string | null>(null);

	// Local mode state
	let selectedRegionId = $state<string>(NZ_REGIONS[0].id);
	let geoError = $state<string | null>(null);
	let geoLoading = $state(false);

	// Map & connector state
	let mapComponent: HomeMap | null = null;
	let mapReady = $state(false);
	let redrawTrigger = $state(0);
	let listItemEls = new Map<string, HTMLElement>();

	// --- Data fetching ---
	async function fetchPosts() {
		loading = true;
		error = null;
		try {
			const url =
				scope === 'national'
					? '/api/posts?scope=national'
					: `/api/posts?scope=local&regionId=${selectedRegionId}`;
			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			posts = json.posts as PostSummary[];
		} catch (e) {
			error = 'Failed to load posts. Please try again.';
			posts = [];
		} finally {
			loading = false;
		}
	}

	// --- Scope toggle ---
	async function switchToNational() {
		scope = 'national';
		geoError = null;
		mapComponent?.fitToBbox(NZ_BBOX);
		await fetchPosts();
	}

	async function switchToLocal() {
		scope = 'local';
		geoLoading = true;
		geoError = null;

		if (typeof navigator !== 'undefined' && navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(
				async (pos) => {
					const regionId = regionForPoint(pos.coords.longitude, pos.coords.latitude);
					selectedRegionId = regionId;
					geoLoading = false;
					zoomToRegion(regionId);
					await fetchPosts();
				},
				async () => {
					geoError = 'Location access denied — pick your region below.';
					geoLoading = false;
					zoomToRegion(selectedRegionId);
					await fetchPosts();
				},
				{ timeout: 8000 }
			);
		} else {
			geoError = 'Geolocation not available — pick your region below.';
			geoLoading = false;
			zoomToRegion(selectedRegionId);
			await fetchPosts();
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
		zoomToRegion(selectedRegionId);
		await fetchPosts();
	}

	// --- Map callbacks ---
	function handleMapReady(map: unknown) {
		mapReady = true;
		redrawTrigger++;
	}

	function handleMarkerPositionsChange() {
		redrawTrigger++;
	}

	function getMarkerScreenPos(id: string): { x: number; y: number } | null {
		return mapComponent?.getMarkerScreenPos(id) ?? null;
	}

	// --- Init ---
	onMount(() => {
		fetchPosts();
	});

	$effect(() => {
		// When posts change or map becomes ready, trigger redraw
		posts;
		mapReady;
		redrawTrigger;
	});
</script>

<div class="page">
	<!-- Header -->
	<header class="header card">
		<div class="logo" onclick={() => goto('/')} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && goto('/')}>
			<span class="logo-dot"></span>
			<span class="logo-name gradient-text">BirdsEye</span>
		</div>

		<div class="header-center">
			<div class="scope-toggle">
				<button
					class="toggle-btn"
					class:active={scope === 'national'}
					onclick={switchToNational}
					aria-pressed={scope === 'national'}
				>
					National
				</button>
				<button
					class="toggle-btn"
					class:active={scope === 'local'}
					onclick={switchToLocal}
					aria-pressed={scope === 'local'}
				>
					Local
				</button>
			</div>

			{#if scope === 'local'}
				<div class="region-controls">
					{#if geoLoading}
						<span class="muted" style="font-size:12px;">Detecting location…</span>
					{/if}
					{#if geoError}
						<span class="error-text" style="font-size:12px;">{geoError}</span>
					{/if}
					<select class="input region-select" value={selectedRegionId} onchange={onRegionChange}>
						{#each NZ_REGIONS as region (region.id)}
							<option value={region.id}>{region.name}</option>
						{/each}
					</select>
				</div>
			{/if}
		</div>

		<div class="header-right">
			<a href="/compose" class="btn btn-primary new-post-btn">
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
				</svg>
				New post
			</a>
			<UserMenu user={data.user} />
		</div>
	</header>

	<!-- Main content -->
	<main class="main">
		<!-- Map area -->
		<div class="map-area">
			{#if loading}
				<div class="map-loading" aria-live="polite">
					<div class="spinner"></div>
				</div>
			{/if}
			<HomeMap
				bind:this={mapComponent}
				{posts}
				{hoveredPostId}
				onMapReady={handleMapReady}
				onMarkerPositionsChange={handleMarkerPositionsChange}
			/>
		</div>

		<!-- Headline list panel -->
		<div class="panel-area">
			{#if posts.length === 0 && !loading}
				<div class="empty-state card">
					<div class="empty-icon">📍</div>
					<h2 class="empty-title">No posts here yet</h2>
					<p class="muted empty-body">Be the first to share what's happening in your community.</p>
					<a href="/compose" class="btn btn-primary">Create a post</a>
				</div>
			{:else}
				<HeadlineList
					{posts}
					{hoveredPostId}
					onHover={(id) => {
						hoveredPostId = id;
						redrawTrigger++;
					}}
					{listItemEls}
				/>
			{/if}

			{#if error}
				<div class="error-banner card">
					<span class="error-text">{error}</span>
					<button class="btn" onclick={fetchPosts} style="font-size:12px;padding:6px 12px;">Retry</button>
				</div>
			{/if}
		</div>
	</main>

	<!-- Connector SVG overlay -->
	{#if mapReady}
		<ConnectorLines
			{posts}
			{hoveredPostId}
			{getMarkerScreenPos}
			{listItemEls}
			{redrawTrigger}
		/>
	{/if}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
		background: var(--bg);
	}

	/* ---- Header ---- */
	.header {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 0 20px;
		height: 58px;
		flex-shrink: 0;
		border-radius: 0;
		border-left: none;
		border-right: none;
		border-top: none;
		z-index: 20;
		position: relative;
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
		display: flex;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 3px;
		gap: 2px;
	}

	.toggle-btn {
		padding: 5px 16px;
		border-radius: calc(var(--radius-sm) - 2px);
		border: none;
		background: transparent;
		color: var(--text-2);
		font-size: 13px;
		font-weight: 550;
		transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
	}

	.toggle-btn.active {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-sm);
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

	/* ---- Main ---- */
	.main {
		flex: 1;
		display: flex;
		overflow: hidden;
		position: relative;
	}

	.map-area {
		flex: 1;
		position: relative;
		overflow: hidden;
	}

	.map-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
		background: rgba(255, 255, 255, 0.6);
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
		to { transform: rotate(360deg); }
	}

	.panel-area {
		width: 320px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		overflow-y: auto;
		z-index: 10;
		background: var(--surface-2);
		border-left: 1px solid var(--border);
	}

	/* ---- Empty state ---- */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 32px 20px;
		gap: 12px;
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

	/* ---- Error banner ---- */
	.error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 14px;
		flex-shrink: 0;
	}
</style>

