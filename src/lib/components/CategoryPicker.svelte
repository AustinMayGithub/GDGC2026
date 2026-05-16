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
		class:selected={value === 'factual'}
		onclick={() => onchange('factual')}
		aria-pressed={value === 'factual'}
	>
		<span class="picker-icon">📋</span>
		<div class="picker-text">
			<strong>Something happened</strong>
			<span class="picker-sub">A factual claim — an event, incident, or news item.</span>
		</div>
		{#if value === 'factual'}
			<span class="check">✓</span>
		{/if}
	</button>

	<button
		type="button"
		class="picker-card"
		class:selected={value === 'personal'}
		onclick={() => onchange('personal')}
		aria-pressed={value === 'personal'}
	>
		<span class="picker-icon">📣</span>
		<div class="picker-text">
			<strong>Community notice / opinion</strong>
			<span class="picker-sub">An event, discussion, or personal view — no truth claim.</span>
		</div>
		{#if value === 'personal'}
			<span class="check">✓</span>
		{/if}
	</button>

	{#if value === 'factual'}
		<div class="factual-notice">
			<span class="notice-icon">⚠️</span>
			Factual posts are subject to community verification.
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
	.factual-notice {
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
