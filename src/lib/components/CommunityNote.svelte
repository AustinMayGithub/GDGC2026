<script lang="ts">
	import type { CommunityNote } from '$lib/types';

	interface Props {
		note: CommunityNote | null;
	}

	let { note }: Props = $props();

	function relativeTime(isoString: string): string {
		const diff = Date.now() - new Date(isoString).getTime();
		const minutes = Math.floor(diff / 60000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}
</script>

<div class="note-card card">
	<div class="note-header">
		<span class="note-icon">🤖</span>
		<div class="note-titles">
			<span class="note-title">Community Note</span>
			<span class="note-subtitle muted">AI summary of the discussion — not a fact check</span>
		</div>
	</div>

	{#if note}
		<p class="note-body">{note.body}</p>
		<p class="note-meta muted">
			Updated {relativeTime(note.generatedAt)}, based on {note.basedOnCommentCount}
			{note.basedOnCommentCount === 1 ? 'comment' : 'comments'}
		</p>
	{:else}
		<p class="note-empty muted">
			No discussion yet — be the first to comment below.
		</p>
	{/if}
</div>

<style>
	.note-card {
		padding: 16px;
		background: var(--surface-2);
		border-left: 3px solid var(--border-strong);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.note-header {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}
	.note-icon {
		font-size: 18px;
		line-height: 1.2;
		flex-shrink: 0;
	}
	.note-titles {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.note-title {
		font-weight: 650;
		font-size: 13px;
	}
	.note-subtitle {
		font-size: 11px;
	}
	.note-body {
		margin: 0;
		font-size: 14px;
		line-height: 1.6;
		color: var(--text);
	}
	.note-empty {
		margin: 0;
		font-size: 14px;
		font-style: italic;
	}
	.note-meta {
		margin: 0;
		font-size: 11px;
	}
</style>
