<script lang="ts">
	import type { SessionUser, PostCategory } from '$lib/types';
	import { goto } from '$app/navigation';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import ImpactMap from '$lib/components/ImpactMap.svelte';
	import CategoryPicker from '$lib/components/CategoryPicker.svelte';
	import HeaderImageCropper from '$lib/components/HeaderImageCropper.svelte';
	import { fallbackAreaLabel } from '$lib/data/geo-labels';

	interface PageData {
		user: SessionUser | null;
		hasUnreadNotifications: boolean;
	}

	let { data }: { data: PageData } = $props();

	const user = $derived(data.user);
	const hasUnreadNotifications = $derived(data.hasUnreadNotifications);

	// Form state
	let title = $state('');
	let body = $state('');
	let headerImageDataUrl = $state<string | null>(null);
	let imageDataUrls = $state<string[]>([]);
	let category = $state<PostCategory | null>(null);
	let lng = $state(174.76); // Default: Auckland
	let lat = $state(-36.85);
	let radiusM = $state(1000);
	let anonymous = $state(false);
	let submitting = $state(false);
	let error = $state('');
	let areaLabel = $state('Local Auckland area');
	let areaLabelRequestId = 0;

	const RADIUS_MIN_M = 100;
	const RADIUS_MAX_M = 50000;
	const RADIUS_SLIDER_MAX = 1000;

	const canSubmit = $derived(
		title.trim().length > 0 &&
		body.trim().length > 0 &&
		category !== null &&
		!submitting
	);

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

	function handlePick(newLng: number, newLat: number) {
		lng = newLng;
		lat = newLat;
		void refreshAreaLabel();
	}

	function handleRadiusInput(e: Event) {
		radiusM = sliderToRadius(Number((e.currentTarget as HTMLInputElement).value));
		void refreshAreaLabel();
	}

	async function refreshAreaLabel() {
		const requestId = ++areaLabelRequestId;
		areaLabel = fallbackAreaLabel(lng, lat, radiusM);
		try {
			const params = new URLSearchParams({
				lng: String(lng),
				lat: String(lat),
				radiusM: String(radiusM)
			});
			const res = await fetch(`/api/location-label?${params}`);
			if (requestId !== areaLabelRequestId || !res.ok) return;
			const json = (await res.json()) as { label?: string };
			if (json.label) areaLabel = json.label;
		} catch {
			// Keep fallback label.
		}
	}

	function handleCategory(cat: PostCategory) {
		category = cat;
	}

	function handleHeaderImage(dataUrl: string | null) {
		headerImageDataUrl = dataUrl;
	}

	function handleHeaderImages(dataUrls: string[]) {
		imageDataUrls = dataUrls;
		headerImageDataUrl = dataUrls[0] ?? null;
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmit || category === null) return;

		error = '';
		submitting = true;

		try {
			const res = await fetch('/api/posts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					body: body.trim(),
					headerImageDataUrl,
					imageDataUrls,
					category,
					anonymous,
					lng,
					lat,
					impactRadiusM: radiusM
				})
			});

			if (res.ok) {
				const data = await res.json();
				await goto(`/post/${data.id}`);
			} else {
				const data = await res.json();
				error = data.message ?? 'Failed to create post. Please try again.';
			}
		} catch {
			error = 'Network error. Please check your connection and try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>New post — BirdsEye</title>
</svelte:head>

<div class="page">
	<header class="topbar">
		<a class="back-link btn" href="/">Back</a>
		<span class="topbar-title gradient-text">BirdsEye</span>
		<UserMenu {user} {hasUnreadNotifications} />
	</header>

	<div class="content">
		{#if !user}
			<!-- Not signed in -->
			<div class="gate-card card">
				<div class="gate-icon">✍️</div>
				<h1 class="gate-heading">Share something with your community</h1>
				<p class="muted gate-sub">
					You need to sign in to post to BirdsEye.
				</p>
				<a class="btn btn-primary gate-btn" href="/auth/login">Sign in to post</a>
				<a class="muted signup-link" href="/auth/signup">Don't have an account? Sign up</a>
			</div>
		{:else}
			<div class="compose-layout">
				<!-- Left: form -->
				<form class="form-col" onsubmit={handleSubmit}>
					<div class="form-header">
						<h1 class="form-title">New post</h1>
						<p class="muted form-sub">Share something happening in your area.</p>
					</div>

					<!-- Header image -->
					<div class="field">
						<span class="field-label">Header image</span>
						<HeaderImageCropper
							disabled={submitting}
							onimagechange={handleHeaderImage}
							onimageschange={handleHeaderImages}
						/>
						<span class="field-hint muted">Optional. Add up to 6 wide gallery images.</span>
					</div>

					<!-- Title -->
					<div class="field">
						<label class="field-label" for="post-title">Title</label>
						<input
							id="post-title"
							class="input"
							type="text"
							placeholder="What happened? Keep it brief."
							bind:value={title}
							maxlength={140}
							disabled={submitting}
							required
						/>
						<span class="field-hint muted">{title.length}/140</span>
					</div>

					<!-- Body -->
					<div class="field">
						<label class="field-label" for="post-body">Details</label>
						<textarea
							id="post-body"
							class="input body-input"
							placeholder="Describe what you saw or want to share…"
							bind:value={body}
							rows={6}
							disabled={submitting}
							required
						></textarea>
					</div>

					<!-- Category -->
					<div class="field">
						<span class="field-label">Category</span>
						<CategoryPicker value={category} onchange={handleCategory} />
					</div>

					<!-- Anonymous toggle -->
					<label class="anon-row">
						<input type="checkbox" bind:checked={anonymous} disabled={submitting} class="anon-check" />
						<span class="anon-text">
							Post anonymously
							<span class="field-hint muted">— your name won't be shown publicly</span>
						</span>
					</label>

					<!-- Error -->
					{#if error}
						<p class="error-text error-msg">{error}</p>
					{/if}

					<!-- Submit -->
					<div class="submit-row">
						<button
							type="submit"
							class="btn btn-primary submit-btn"
							disabled={!canSubmit}
						>
							{submitting ? 'Posting…' : 'Publish post'}
						</button>
						<a href="/" class="btn cancel-btn">Cancel</a>
					</div>
				</form>

				<!-- Right: map + radius -->
				<div class="map-col">
					<div class="map-card card">
						<div class="map-card-header">
							<h2 class="map-heading">Location &amp; affected area</h2>
							<p class="muted map-sub">Click the map to drop your pin.</p>
						</div>

						<div class="map-wrapper">
							<ImpactMap
								{lng}
								{lat}
								radiusM={radiusM}
								interactive={true}
								onpick={handlePick}
							/>
						</div>

						<div class="coords-row muted">
							<span>{areaLabel}</span>
						</div>

						<!-- Radius slider -->
						<div class="radius-field">
							<div class="radius-label-row">
								<label class="field-label" for="radius-slider">Affected location</label>
								<span class="radius-value gradient-text">{formatRadius(radiusM)}</span>
							</div>
							<input
								id="radius-slider"
								type="range"
								class="radius-slider"
								min={0}
								max={RADIUS_SLIDER_MAX}
								step={1}
								value={radiusToSlider(radiusM)}
								oninput={handleRadiusInput}
							/>
							<div class="radius-hints muted">
								<span>100 m</span>
								<span>50 km</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: var(--bg);
	}

	.topbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 24px;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		position: sticky;
		top: 0;
		z-index: 30;
	}
	.back-link {
		font-size: 13px;
		padding: 7px 14px;
		white-space: nowrap;
	}
	.topbar-title {
		font-size: 18px;
		font-weight: 800;
		letter-spacing: -0.03em;
		flex: 1;
		text-align: center;
	}

	.content {
		flex: 1;
		padding: 32px 24px 64px;
		display: flex;
		justify-content: center;
	}

	/* Not signed in */
	.gate-card {
		max-width: 420px;
		width: 100%;
		margin: 60px auto 0;
		padding: 48px 40px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		text-align: center;
	}
	.gate-icon {
		font-size: 40px;
	}
	.gate-heading {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.gate-sub {
		font-size: 15px;
		margin: 0;
	}
	.gate-btn {
		width: 100%;
		padding: 12px;
		font-size: 15px;
		margin-top: 6px;
	}
	.signup-link {
		font-size: 13px;
	}
	.signup-link:hover { color: var(--accent); }

	/* Compose layout */
	.compose-layout {
		display: flex;
		gap: 28px;
		max-width: 1100px;
		width: 100%;
		align-items: flex-start;
	}

	.form-col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}

	.form-header {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.form-title {
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.form-sub { margin: 0; font-size: 14px; }

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field-label {
		font-size: 13px;
		font-weight: 650;
		color: var(--text-2);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.field-hint {
		font-size: 11px;
		align-self: flex-end;
	}
	.body-input {
		resize: vertical;
	}

	.error-msg {
		margin: 0;
		font-size: 14px;
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
		cursor: pointer;
		accent-color: var(--accent);
	}
	.anon-text {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
	}

	.submit-row {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.submit-btn {
		flex: 1;
		padding: 12px;
		font-size: 15px;
		font-weight: 700;
	}
	.cancel-btn {
		padding: 12px 20px;
	}

	/* Map column */
	.map-col {
		width: 420px;
		flex-shrink: 0;
		position: sticky;
		top: 76px;
	}

	.map-card {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.map-card-header {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.map-heading {
		font-size: 15px;
		font-weight: 650;
	}
	.map-sub { margin: 0; font-size: 13px; }

	.map-wrapper {
		height: 280px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		cursor: crosshair;
	}

	.coords-row {
		font-size: 12px;
		font-family: monospace;
	}

	/* Radius slider */
	.radius-field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.radius-label-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.radius-value {
		font-size: 16px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.radius-slider {
		width: 100%;
		accent-color: var(--accent);
		cursor: pointer;
	}
	.radius-hints {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
	}

	/* Responsive */
	@media (max-width: 860px) {
		.compose-layout {
			flex-direction: column;
		}
		.map-col {
			width: 100%;
			position: static;
		}
		.content {
			padding: 20px 16px 48px;
		}
	}
</style>
