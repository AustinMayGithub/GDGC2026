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

	const total = $derived(verifyCount + disputeCount);
	const verifyPct = $derived(total === 0 ? 50 : Math.round((verifyCount / total) * 100));
	const disputePct = $derived(100 - verifyPct);

	// Warm the location provider as soon as the meter is on screen, so the
	// voter isn't waiting on a cold GPS fix the moment they click Verify.
	onMount(() => {
		if (user) prewarm();
	});

	async function vote(value: VoteValue) {
		if (loading || locating) return;
		error = '';

		// 1. Establish where the voter is — required to vote (project.md §4.4).
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
			error = `You're ${formatDistance(distance)} from this story — you must be inside its ${formatDistance(post.impactRadiusM)} impact zone to vote.`;
			return;
		}

		// 3. Optimistic update.
		const prev = { verifyCount, disputeCount, myVote };
		if (myVote === value) {
			if (value === 'verify') verifyCount--;
			else disputeCount--;
			myVote = null;
		} else {
			if (myVote === 'verify') verifyCount--;
			else if (myVote === 'dispute') disputeCount--;
			if (value === 'verify') verifyCount++;
			else disputeCount++;
			myVote = value;
		}

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

	$effect(() => {
		if (currentPostId === post.id) return;
		currentPostId = post.id;
		verifyCount = post.verifyCount;
		disputeCount = post.disputeCount;
		myVote = post.myVote;
	});
</script>

<div class="meter-card card">
	<div class="meter-header">
		<span class="meter-label">Community credibility</span>
		<span class="meter-counts muted">
			{verifyCount} verified · {disputeCount} disputed
		</span>
	</div>

	<div class="bar-track" style="--verify-pct: {verifyPct}%;" aria-label="Credibility: {verifyPct}% verified">
		{#if total === 0}
			<div class="bar-empty">No votes yet</div>
		{:else}
			<div class="bar-verify" style="width: {verifyPct}%"></div>
			{#if verifyPct > 0 && verifyPct < 100}
				<div class="bar-slice" aria-hidden="true"></div>
			{/if}
			<div class="bar-dispute" style="width: {disputePct}%"></div>
			<div class="bar-labels" aria-hidden="true">
				<span>{verifyPct}% verified</span>
				<span>{disputePct}% disputed</span>
			</div>
		{/if}
	</div>

	{#if !user}
		<p class="prompt muted">
			<a href="/auth/login" class="link">Sign in</a> to verify or dispute this post.
		</p>
	{:else}
		<div class="vote-row">
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
				✗ Dispute
			</button>
		</div>
		<p class="gate-hint muted">
			{#if locating}
				📍 Checking you're inside the impact zone…
			{:else}
				📍 Voting confirms your location is inside the story's impact zone.
			{/if}
		</p>
	{/if}

	{#if error}
		<p class="error-text">{error}</p>
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
		display: flex;
		height: 54px;
		border-radius: 6px;
		overflow: hidden;
		background: var(--surface-3);
		border: 1px solid rgba(15, 23, 42, 0.1);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
	}
	.bar-empty {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		font-weight: 750;
		color: var(--text-3);
	}
	.bar-verify {
		background: var(--verify);
		transition: width 0.4s ease;
	}
	.bar-dispute {
		background: var(--dispute);
		transition: width 0.4s ease;
	}
	.bar-slice {
		position: absolute;
		top: -8px;
		bottom: -8px;
		left: var(--verify-pct);
		width: 16px;
		background: var(--surface);
		transform: translateX(-50%) skewX(-18deg);
		box-shadow:
			-1px 0 0 rgba(255, 255, 255, 0.45),
			1px 0 0 rgba(15, 23, 42, 0.08);
		z-index: 1;
		pointer-events: none;
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
		z-index: 2;
		pointer-events: none;
	}
	.bar-labels span {
		min-width: 0;
		white-space: nowrap;
	}
	.vote-row {
		display: flex;
		gap: 8px;
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
	.link { color: var(--accent); font-weight: 600; }
</style>
