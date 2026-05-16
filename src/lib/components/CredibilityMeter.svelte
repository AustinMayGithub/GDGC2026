<script lang="ts">
	import type { PostDetail, SessionUser, VoteValue } from '$lib/types';

	interface Props {
		post: PostDetail;
		user: SessionUser | null;
	}

	let { post, user }: Props = $props();

	let currentPostId = $state<string | null>(null);
	let verifyCount = $state(0);
	let disputeCount = $state(0);
	let myVote = $state<VoteValue | null>(null);
	let loading = $state(false);
	let error = $state('');

	const total = $derived(verifyCount + disputeCount);
	const verifyPct = $derived(total === 0 ? 50 : Math.round((verifyCount / total) * 100));
	const disputePct = $derived(100 - verifyPct);

	async function vote(value: VoteValue) {
		if (loading) return;
		error = '';
		// Optimistic update
		const prev = { verifyCount, disputeCount, myVote };
		if (myVote === value) {
			// toggle off
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
				body: JSON.stringify({ vote: myVote ?? value })
			});
			if (!res.ok) {
				const data = await res.json();
				error = data.message ?? 'Vote failed';
				// Revert
				verifyCount = prev.verifyCount;
				disputeCount = prev.disputeCount;
				myVote = prev.myVote;
			} else {
				const data = await res.json();
				verifyCount = data.verifyCount;
				disputeCount = data.disputeCount;
				myVote = data.myVote;
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

	<div class="bar-track" aria-label="Credibility: {verifyPct}% verified">
		{#if total === 0}
			<div class="bar-empty">No votes yet</div>
		{:else}
			<div class="bar-verify" style="width: {verifyPct}%"></div>
			<div class="bar-dispute" style="width: {disputePct}%"></div>
		{/if}
	</div>

	{#if total > 0}
		<div class="pct-row">
			<span class="pct-verify">{verifyPct}% verified</span>
			<span class="pct-dispute">{disputePct}% disputed</span>
		</div>
	{/if}

	{#if !user}
		<p class="prompt muted">
			<a href="/auth/login" class="link">Sign in</a> to verify or dispute this post.
		</p>
	{:else if !user.emailVerified}
		<p class="prompt muted">
			Verify your email to cast a vote.
		</p>
	{:else}
		<div class="vote-row">
			<button
				class="btn vote-btn verify-btn"
				class:active={myVote === 'verify'}
				onclick={() => vote('verify')}
				disabled={loading}
			>
				✓ Verify
			</button>
			<button
				class="btn vote-btn dispute-btn"
				class:active={myVote === 'dispute'}
				onclick={() => vote('dispute')}
				disabled={loading}
			>
				✗ Dispute
			</button>
		</div>
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
		display: flex;
		height: 8px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--surface-3);
	}
	.bar-empty {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
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
	.pct-row {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		font-weight: 600;
	}
	.pct-verify { color: var(--verify); }
	.pct-dispute { color: var(--dispute); }
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
	.link { color: var(--accent); font-weight: 600; }
</style>
