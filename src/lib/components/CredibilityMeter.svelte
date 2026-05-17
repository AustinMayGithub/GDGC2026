<script lang="ts">
	import { onMount } from 'svelte';
	import type { PostDetail, SessionUser, VoteValue, VotePoint, VoteUser } from '$lib/types';
	import { haversineMeters, formatDistance, MAX_ACCURACY_BUFFER_M } from '$lib/geo';
	import { getLocation, prewarm, type GeoFix } from '$lib/location';

	interface VoteResult {
		verifyCount: number;
		disputeCount: number;
		myVote: VoteValue | null;
		points: VotePoint[];
		voters?: VoteUser[];
	}

	interface Props {
		post: PostDetail;
		user: SessionUser | null;
		/** Called after a successful vote so the article view can refresh the heatmap. */
		onVoted?: (result: VoteResult) => void;
	}

	let { post, user, onVoted }: Props = $props();

	let currentPostId = $state<string | null>(null);
	let verifyCount = $state(0);
	let disputeCount = $state(0);
	let myVote = $state<VoteValue | null>(null);
	let loading = $state(false);
	let locating = $state(false);
	let error = $state('');
	let outOfRangeVote = $state<VoteValue | null>(null);

	const total = $derived(verifyCount + disputeCount);
	const verifyPct = $derived(total === 0 ? 50 : Math.round((verifyCount / total) * 100));
	const disputePct = $derived(100 - verifyPct);
	const canVote = $derived(Boolean(user) && !loading && !locating);
	const reliabilitySummary = $derived(
		total === 0
			? 'No reliability ratings yet'
			: `This claim is ${verifyPct}% verified by the community`
	);

	// Warm the location provider as soon as the meter is on screen, so the
	// voter isn't waiting on a cold GPS fix the moment they rate reliability.
	onMount(() => {
		if (user) prewarm();
	});

	async function vote(value: VoteValue) {
		if (loading || locating) return;
		if (myVote === value) return;
		error = '';
		outOfRangeVote = null;

		// 1. Establish where the rater is - required for reliability ratings.
		//    The shared service usually has a warm fix ready, so this is instant.
		locating = true;
		let fix: GeoFix;
		try {
			fix = await getLocation();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not get your location.';
			locating = false;
			return;
		}
		locating = false;

		const voterLng = fix.lng;
		const voterLat = fix.lat;
		const accuracyM = fix.accuracyM;

		// 2. Fail fast client-side with a clear distance message before the round trip.
		const distance = haversineMeters(post.lng, post.lat, voterLng, voterLat);
		const buffer = Math.min(accuracyM, MAX_ACCURACY_BUFFER_M);
		if (distance > post.impactRadiusM + buffer) {
			outOfRangeVote = value;
			error = `You're ${formatDistance(distance)} from this story - you must be inside its ${formatDistance(post.impactRadiusM)} impact zone to rate reliability.`;
			return;
		}

		// 3. Optimistic update.
		const prev = { verifyCount, disputeCount, myVote };
		if (myVote === 'verify') verifyCount--;
		else if (myVote === 'dispute') disputeCount--;
		if (value === 'verify') verifyCount++;
		else disputeCount++;
		myVote = value;

		loading = true;
		try {
			const res = await fetch(`/api/posts/${post.id}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ vote: myVote ?? value, voterLng, voterLat, accuracyM })
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				error = data.message ?? 'Vote failed';
				verifyCount = prev.verifyCount;
				disputeCount = prev.disputeCount;
				myVote = prev.myVote;
			} else {
				const data: VoteResult = await res.json();
				verifyCount = data.verifyCount;
				disputeCount = data.disputeCount;
				myVote = data.myVote;
				outOfRangeVote = null;
				onVoted?.(data);
			}
		} catch {
			error = 'Network error';
			verifyCount = prev.verifyCount;
			disputeCount = prev.disputeCount;
			myVote = prev.myVote;
		} finally {
			loading = false;
		}
	}

	function randomPointInsideImpactRadius(): { lng: number; lat: number } {
		const earthRadiusM = 6371000;
		const bearing = Math.random() * Math.PI * 2;
		const distance = Math.sqrt(Math.random()) * post.impactRadiusM * 0.95;
		const angularDistance = distance / earthRadiusM;
		const lat1 = (post.lat * Math.PI) / 180;
		const lng1 = (post.lng * Math.PI) / 180;

		const lat2 = Math.asin(
			Math.sin(lat1) * Math.cos(angularDistance) +
				Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
		);
		const lng2 =
			lng1 +
			Math.atan2(
				Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
				Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
			);

		return {
			lng: (lng2 * 180) / Math.PI,
			lat: (lat2 * 180) / Math.PI
		};
	}

	async function moveVoteLocationIntoRange() {
		if (!outOfRangeVote || loading || locating) return;
		error = '';
		loading = true;
		const testLocation = randomPointInsideImpactRadius();

		try {
			const res = await fetch(`/api/posts/${post.id}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vote: outOfRangeVote,
					voterLng: testLocation.lng,
					voterLat: testLocation.lat,
					accuracyM: 0
				})
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				error = data.message ?? 'Vote failed';
			} else {
				const data: VoteResult = await res.json();
				verifyCount = data.verifyCount;
				disputeCount = data.disputeCount;
				myVote = data.myVote;
				outOfRangeVote = null;
				onVoted?.(data);
			}
		} catch {
			error = 'Network error';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (currentPostId === post.id) return;
		currentPostId = post.id;
		verifyCount = post.verifyCount;
		disputeCount = post.disputeCount;
		myVote = post.myVote;
		outOfRangeVote = null;
		error = '';
	});
</script>

<div class="meter-card card">
	<div class="meter-header">
		<span class="meter-label">Community reliability</span>
		<span class="meter-counts muted">
			{reliabilitySummary}
		</span>
	</div>

	<div
		class="bar-track"
		class:no-votes={total === 0}
		class:has-left-arrow={total > 0 && verifyPct === 0}
		class:has-right-arrow={total > 0 && disputePct === 0}
		style="--verify-pct: {verifyPct}%; --dispute-pct: {disputePct}%;"
		aria-label="Community reliability: {verifyPct}% verified, {disputePct}% untrue"
	>
		<div class="bar-clip">
			<div
				class="bar-fill bar-verify"
				class:active={myVote === 'verify'}
				style="width: {verifyPct === 0 ? '0%' : `calc(${verifyPct}% + 18px)`}"
			></div>
			<div
				class="bar-fill bar-dispute"
				class:active={myVote === 'dispute'}
				style="width: {disputePct === 0 ? '0%' : `calc(${disputePct}% + 18px)`}"
			></div>
			<div class="bar-labels" aria-hidden="true">
				<span>{total === 0 ? 'Verify' : `${verifyPct}% verified`}</span>
				<span>{total === 0 ? 'Untrue' : `${disputePct}% untrue`}</span>
			</div>
		</div>
		<button
			type="button"
			class="bar-hit bar-hit-verify"
			class:edge-visible={total > 0 && verifyPct === 0}
			aria-label="Verify this claim"
			onclick={() => vote('verify')}
			disabled={!canVote}
		></button>
		<button
			type="button"
			class="bar-hit bar-hit-dispute"
			class:edge-visible={total > 0 && disputePct === 0}
			aria-label="Mark this claim as untrue"
			onclick={() => vote('dispute')}
			disabled={!canVote}
		></button>
	</div>

	{#if !user}
		<p class="prompt muted">
			<a href="/auth/login" class="link">Sign in</a> to rate this source's reliability.
		</p>
	{:else}
		<div class="vote-row" hidden>
			<button
				class="btn vote-btn verify-btn"
				class:active={myVote === 'verify'}
				onclick={() => vote('verify')}
				disabled={loading || locating}
			>
				✓ Verify
			</button>
			<button
				class="btn vote-btn dispute-btn"
				class:active={myVote === 'dispute'}
				onclick={() => vote('dispute')}
				disabled={loading || locating}
			>
				✗ Untrue
			</button>
		</div>
		<p class="gate-hint muted">
			{#if locating}
				Checking you're inside the impact zone…
			{:else}
				Reliability ratings confirm your location is inside the story's impact zone.
			{/if}
		</p>
	{/if}

	{#if error}
		<p class="error-text">{error}</p>
		{#if user && outOfRangeVote}
			<button
				type="button"
				class="btn test-location-btn"
				onclick={moveVoteLocationIntoRange}
				disabled={loading || locating}
			>
				Move rating location into range
			</button>
			<p class="test-location-note muted">
				Testing only: records this rating at a random point inside the story radius.
			</p>
		{/if}
	{/if}
</div>

<style>
	.meter-card {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.meter-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px;
	}
	.meter-label {
		font-weight: 650;
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.meter-counts {
		font-size: 12px;
	}
	.bar-track {
		position: relative;
		height: 54px;
		transition: margin 0.2s ease;
	}
	.bar-track.has-left-arrow {
		margin-left: 36px;
	}
	.bar-track.has-right-arrow {
		margin-right: 36px;
	}
	.bar-clip {
		position: absolute;
		inset: 0;
		border-radius: 6px;
		overflow: hidden;
		background:
			linear-gradient(
				108deg,
				var(--verify) 0,
				var(--verify) calc(var(--verify-pct) + 10px),
				var(--dispute) calc(var(--verify-pct) + 10px),
				var(--dispute) 100%
			);
		border: 1px solid rgba(15, 23, 42, 0.1);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
	}
	.bar-fill {
		position: absolute;
		top: 0;
		bottom: 0;
		transition: width 0.4s ease, filter 0.16s ease;
		will-change: width;
	}
	.bar-verify {
		left: 0;
		background: var(--verify);
		clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 100%, 0 100%);
	}
	.bar-dispute {
		right: 0;
		background: var(--dispute);
		clip-path: polygon(0 0, 100% 0, 100% 100%, 18px 100%);
	}
	.bar-track.no-votes .bar-fill {
		filter: saturate(0.72) opacity(0.92);
	}
	.bar-fill.active {
		filter: brightness(0.9) saturate(1.16);
	}
	.bar-labels {
		position: absolute;
		inset: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 0 14px;
		color: #ffffff;
		font-size: 14px;
		font-weight: 850;
		line-height: 1;
		text-shadow: 0 1px 2px rgba(15, 23, 42, 0.35);
		z-index: 3;
		pointer-events: none;
	}
	.bar-labels span {
		min-width: 0;
		white-space: nowrap;
	}
	.bar-hit {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 50%;
		border: 0;
		background: transparent;
		z-index: 4;
		cursor: pointer;
	}
	.bar-hit.edge-visible {
		width: 24px;
		overflow: visible;
	}
	.bar-hit.edge-visible::before {
		content: '';
		position: absolute;
		top: 50%;
		width: 20px;
		height: 24px;
		transform: translateY(-50%);
		border-radius: 5px;
		filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.22));
	}
	.bar-hit:disabled {
		cursor: not-allowed;
	}
	.bar-hit-verify {
		left: 0;
	}
	.bar-hit-verify.edge-visible::before {
		left: -31px;
		background: var(--verify);
		clip-path: polygon(0 0, 100% 50%, 0 100%);
	}
	.bar-hit-dispute {
		right: 0;
	}
	.bar-hit-dispute.edge-visible::before {
		right: -31px;
		background: var(--dispute);
		clip-path: polygon(100% 0, 0 50%, 100% 100%);
	}
	.bar-track:has(.bar-hit:not(:disabled):hover) .bar-fill {
		filter: brightness(1.04);
	}
	.vote-row {
		display: none;
	}
	.vote-btn {
		flex: 1;
		font-size: 13px;
		font-weight: 700;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}
	.verify-btn { border-color: var(--verify); color: var(--verify); }
	.verify-btn.active { background: var(--verify); color: #fff; }
	.verify-btn:hover:not(:disabled):not(.active) { background: var(--verify-soft); }
	.dispute-btn { border-color: var(--dispute); color: var(--dispute); }
	.dispute-btn.active { background: var(--dispute); color: #fff; }
	.dispute-btn:hover:not(:disabled):not(.active) { background: var(--dispute-soft); }
	.prompt {
		font-size: 13px;
		margin: 0;
	}
	.gate-hint {
		font-size: 11px;
		margin: 0;
		line-height: 1.4;
	}
	.test-location-btn {
		align-self: flex-start;
		padding: 8px 12px;
		font-size: 12px;
	}
	.test-location-note {
		margin: -4px 0 0;
		font-size: 11px;
		line-height: 1.4;
	}
	.link { color: var(--accent); font-weight: 600; }
</style>

