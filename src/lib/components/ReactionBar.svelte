<script lang="ts">
	import type { ReactionTally, SessionUser } from '$lib/types';
	import { REACTIONS } from '$lib/types';

	interface Props {
		postId: string;
		reactions: ReactionTally[];
		user: SessionUser | null;
	}

	let { postId, reactions: initialReactions, user }: Props = $props();

	let reactions = $state<ReactionTally[]>(
		REACTIONS.map((emoji) => {
			const found = initialReactions.find((r) => r.emoji === emoji);
			return found ?? { emoji, count: 0, mine: false };
		})
	);

	let loading = $state<string | null>(null);

	async function react(emoji: string) {
		if (loading) return;
		if (!user) return;

		// Optimistic update
		const prev = reactions.map((r) => ({ ...r }));
		reactions = reactions.map((r) => {
			if (r.emoji !== emoji) return r;
			return { ...r, count: r.mine ? r.count - 1 : r.count + 1, mine: !r.mine };
		});

		loading = emoji;
		try {
			const res = await fetch(`/api/posts/${postId}/react`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ emoji })
			});
			if (res.ok) {
				const data = await res.json();
				reactions = REACTIONS.map((e) => {
					const found = (data.reactions as ReactionTally[]).find((r) => r.emoji === e);
					return found ?? { emoji: e, count: 0, mine: false };
				});
			} else {
				reactions = prev;
			}
		} catch {
			reactions = prev;
		} finally {
			loading = null;
		}
	}
</script>

<div class="reaction-bar">
	{#each reactions as r (r.emoji)}
		<button
			class="reaction-btn"
			class:mine={r.mine}
			class:has-count={r.count > 0}
			onclick={() => react(r.emoji)}
			disabled={!user || loading === r.emoji}
			title={user ? `React with ${r.emoji}` : 'Sign in to react'}
		>
			<span class="emoji">{r.emoji}</span>
			{#if r.count > 0}
				<span class="count">{r.count}</span>
			{/if}
		</button>
	{/each}

	{#if !user}
		<span class="muted sign-in-hint">Sign in to react</span>
	{/if}
</div>

<style>
	.reaction-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.reaction-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface-2);
		font-size: 16px;
		transition: background 0.12s, border-color 0.12s, transform 0.06s;
		cursor: pointer;
	}
	.reaction-btn:hover:not(:disabled) {
		background: var(--surface-3);
		border-color: var(--border-strong);
	}
	.reaction-btn:active:not(:disabled) {
		transform: scale(0.94);
	}
	.reaction-btn.mine {
		background: #ede9fe;
		border-color: var(--accent);
	}
	.reaction-btn:disabled {
		cursor: default;
		opacity: 0.75;
	}
	.emoji {
		line-height: 1;
	}
	.count {
		font-size: 12px;
		font-weight: 650;
		color: var(--text-2);
		line-height: 1;
	}
	.reaction-btn.mine .count {
		color: var(--accent);
	}
	.sign-in-hint {
		font-size: 12px;
		margin-left: 4px;
	}
</style>
