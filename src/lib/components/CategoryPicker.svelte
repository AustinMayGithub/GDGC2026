<script lang="ts">
	import type { PostCategory } from '$lib/types';

	interface Props {
		value: PostCategory | null;
		onchange: (category: PostCategory) => void;
	}

	let { value, onchange }: Props = $props();
</script>

<div class="picker">
	<button
		type="button"
		class="picker-card"
		class:selected={value === 'news'}
		onclick={() => onchange('news')}
		aria-pressed={value === 'news'}
	>
		<span class="picker-icon">📋</span>
		<div class="picker-text">
			<strong>News</strong>
			<span class="picker-sub">A report people can rate for community reliability.</span>
		</div>
		{#if value === 'news'}
			<span class="check">✓</span>
		{/if}
	</button>

	<button
		type="button"
		class="picker-card"
		class:selected={value === 'community'}
		onclick={() => onchange('community')}
		aria-pressed={value === 'community'}
	>
		<span class="picker-icon">📣</span>
		<div class="picker-text">
			<strong>Community post</strong>
			<span class="picker-sub">A notice, discussion, or view that does not need reliability ratings.</span>
		</div>
		{#if value === 'community'}
			<span class="check">✓</span>
		{/if}
	</button>

	{#if value === 'news'}
		<div class="news-notice">
			<span class="notice-icon">⚠️</span>
			News posts receive a community reliability rating.
		</div>
	{/if}
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.picker-card {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px;
		border-radius: var(--radius);
		border: 2px solid var(--border);
		background: var(--surface);
		text-align: left;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
	}
	.picker-card:hover {
		border-color: var(--border-strong);
		box-shadow: var(--shadow-sm);
	}
	.picker-card.selected {
		border-color: var(--accent);
		background: #ede9fe;
	}
	.picker-icon {
		font-size: 22px;
		flex-shrink: 0;
		line-height: 1;
		margin-top: 1px;
	}
	.picker-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
	}
	.picker-text strong {
		font-size: 14px;
		font-weight: 650;
	}
	.picker-sub {
		font-size: 12px;
		color: var(--text-2);
	}
	.check {
		font-size: 16px;
		font-weight: 700;
		color: var(--accent);
		flex-shrink: 0;
	}
	.news-notice {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		background: #fef9c3;
		border: 1px solid #fde047;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 550;
		color: #713f12;
	}
	.notice-icon {
		font-size: 15px;
	}
</style>
