<script lang="ts">
	import { timeAgo } from '$lib/time';
	import type { CommunityNote } from '$lib/types';

	interface Props {
		note: CommunityNote | null;
	}

	let { note }: Props = $props();

	function withoutDisallowedEmoji(text: string) {
		return text.replace(/\u{1f916}/gu, '').trim();
	}
</script>

<div class="note-card card">
	<div class="note-header">
		<div class="note-titles">
			<span class="note-title">Community Note</span>
			<span class="note-subtitle muted">Reader context about this post - not independently fact-checked</span>
		</div>
	</div>

	{#if note}
		<p class="note-body">{withoutDisallowedEmoji(note.body)}</p>
		<p class="note-meta muted">
			Updated {timeAgo(note.generatedAt)}, based on {note.basedOnCommentCount}
			{note.basedOnCommentCount === 1 ? 'comment' : 'comments'}
		</p>
	{:else}
		<p class="note-empty muted">
			No discussion yet - be the first to comment below.
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
