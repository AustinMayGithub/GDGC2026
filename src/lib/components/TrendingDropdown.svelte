<script lang="ts">
	import { getRegion } from '$lib/data/nz-regions';
	import type { PostSummary } from '$lib/types';

	interface Props {
		entries: RankedPost[];
		scope: 'national' | 'local';
		mode: TrendMode;
		open: boolean;
		onOpenChange: (open: boolean) => void;
		onModeChange: (mode: TrendMode) => void;
		onSelect: (id: string) => void;
		itemEls?: Map<string, HTMLElement>;
		onItemsChange?: () => void;
	}

	type TrendMode = 'new' | 'trending' | 'rising';

	type RankedPost = {
		post: PostSummary;
		score: number;
		engagement: number;
	};

	const modeLabels: Record<TrendMode, string> = {
		new: 'New',
		trending: 'Trending',
		rising: 'Rising'
	};

	let {
		entries,
		scope,
		mode,
		open,
		onOpenChange,
		onModeChange,
		onSelect,
		itemEls,
		onItemsChange
	}: Props = $props();

	function timeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const m = Math.floor(diff / 60000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		return `${Math.floor(h / 24)}d ago`;
	}

	function engagementLabel(engagement: number): string {
		return `${engagement} engagement${engagement === 1 ? '' : 's'}`;
	}

	const scopeCopy = $derived(
		scope === 'local'
			? `${modeLabels[mode]} in your area`
			: `${modeLabels[mode]} across New Zealand`
	);

	function setOpen(nextOpen: boolean) {
		onOpenChange(nextOpen);
	}

	function registerEl(el: HTMLElement, postId: string) {
		itemEls?.set(postId, el);
		onItemsChange?.();
		return {
			destroy() {
				itemEls?.delete(postId);
				onItemsChange?.();
			}
		};
	}
</script>

<section class="trending card">
	<button
		type="button"
		class="trending-toggle"
		class:open={open}
		onclick={() => setOpen(!open)}
		aria-expanded={open}
	>
		<div class="toggle-copy">
			<span class="toggle-kicker">{modeLabels[mode]}</span>
			<span class="toggle-sub">{scopeCopy}</span>
		</div>
		<div class="toggle-meta">
			{#if entries.length > 0}
				<span class="toggle-count">{entries.length}</span>
			{/if}
			<svg class="chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</div>
	</button>

	{#if open}
		<div class="trending-menu">
			<div class="trend-tabs" role="tablist" aria-label="Story sort">
				{#each (['new', 'trending', 'rising'] as TrendMode[]) as tab}
					<button
						type="button"
						role="tab"
						class:active={mode === tab}
						aria-selected={mode === tab}
						onclick={() => onModeChange(tab)}
					>
						{modeLabels[tab]}
					</button>
				{/each}
			</div>
			{#if entries.length === 0}
				<p class="empty-copy muted">
					{#if mode === 'new'}
						No new posts here yet.
					{:else if mode === 'rising'}
						Nothing is rising yet. Early reactions and comments will surface stories here.
					{:else}
						Nothing is trending yet. Once people start reacting and commenting, stories will surface here.
					{/if}
				</p>
			{:else}
				<ul class="trending-list">
					{#each entries as item (item.post.id)}
						<li>
							<button
								type="button"
								class="trend-item"
								use:registerEl={item.post.id}
								onclick={() => onSelect(item.post.id)}
							>
								<div class="trend-top">
									<span class={item.post.category === 'factual' ? 'badge badge-factual' : 'badge'}>
										{item.post.category === 'factual' ? 'Factual' : 'Community'}
									</span>
									<span class="trend-time muted">{timeAgo(item.post.createdAt)}</span>
								</div>
								<p class="trend-title">{item.post.title}</p>
								<div class="trend-meta">
									{#if getRegion(item.post.regionId)}
										<span class="muted">{getRegion(item.post.regionId)!.name}</span>
									{/if}
									<span class="trend-pill">{engagementLabel(item.engagement)}</span>
								</div>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

<style>
	.trending {
		overflow: hidden;
	}

	.trending-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 16px;
		border: none;
		background: linear-gradient(135deg, rgba(13, 18, 30, 0.02), rgba(13, 18, 30, 0.07));
		cursor: pointer;
	}

	.toggle-copy {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 3px;
		text-align: left;
	}

	.toggle-kicker {
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-3);
	}

	.toggle-sub {
		font-size: 14px;
		font-weight: 650;
		color: var(--text);
	}

	.toggle-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--text-2);
	}

	.toggle-count {
		min-width: 22px;
		height: 22px;
		padding: 0 6px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: var(--surface);
		border: 1px solid var(--border);
		font-size: 12px;
		font-weight: 700;
		color: var(--text);
	}

	.chevron {
		transition: transform 0.16s ease;
	}

	.trending-toggle.open .chevron {
		transform: rotate(180deg);
	}

	.trending-menu {
		border-top: 1px solid var(--border);
		background: var(--surface);
	}

	.trend-tabs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
		padding: 8px;
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
	}

	.trend-tabs button {
		border: 0;
		border-radius: var(--radius-sm);
		padding: 8px 6px;
		background: transparent;
		color: var(--text-2);
		font-size: 12px;
		font-weight: 750;
		cursor: pointer;
	}

	.trend-tabs button.active {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}

	.empty-copy {
		margin: 0;
		padding: 16px;
		font-size: 13px;
		line-height: 1.5;
	}

	.trending-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.trend-item {
		width: 100%;
		padding: 14px 16px;
		border: none;
		border-bottom: 1px solid var(--border);
		background: transparent;
		cursor: pointer;
		text-align: left;
		display: flex;
		flex-direction: column;
		gap: 8px;
		transition: background 0.14s ease;
	}

	.trend-item:hover {
		background: var(--surface-2);
	}

	.trending-list li:last-child .trend-item {
		border-bottom: none;
	}

	.trend-top,
	.trend-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}

	.trend-time {
		font-size: 11px;
	}

	.trend-title {
		margin: 0;
		font-size: 14px;
		font-weight: 650;
		line-height: 1.45;
		color: var(--text);
	}

	.trend-pill {
		display: inline-flex;
		align-items: center;
		padding: 4px 8px;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.06);
		font-size: 11px;
		font-weight: 700;
		color: var(--text-2);
	}
</style>
