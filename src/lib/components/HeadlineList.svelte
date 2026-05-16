<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PostSummary } from '$lib/types';
	import { getRegion } from '$lib/data/nz-regions';

	interface Props {
		posts: PostSummary[];
		hoveredPostId: string | null;
		onHover: (id: string | null) => void;
		listItemEls: Map<string, HTMLElement>;
	}

	let { posts, hoveredPostId, onHover, listItemEls }: Props = $props();

	function timeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const m = Math.floor(diff / 60000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		return `${Math.floor(h / 24)}d ago`;
	}

	function registerEl(el: HTMLElement, postId: string) {
		listItemEls.set(postId, el);
		return {
			destroy() {
				listItemEls.delete(postId);
			}
		};
	}
</script>

<aside class="headline-panel card">
	<div class="panel-header">
		<span class="panel-title">Latest</span>
		<span class="post-count muted">{posts.length} post{posts.length !== 1 ? 's' : ''}</span>
	</div>

	{#if posts.length === 0}
		<div class="empty-panel">
			<p class="muted">No posts here yet.</p>
			<a href="/compose" class="btn btn-primary" style="font-size:13px;padding:8px 14px;">Be first</a>
		</div>
	{:else}
		<ul class="headline-list">
			{#each posts.slice(0, 10) as post (post.id)}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<li
					use:registerEl={post.id}
					class="headline-item"
					class:hovered={hoveredPostId === post.id}
					onmouseenter={() => onHover(post.id)}
					onmouseleave={() => onHover(null)}
					onclick={() => goto(`/post/${post.id}`)}
					role="button"
					tabindex="0"
					onkeydown={(e) => e.key === 'Enter' && goto(`/post/${post.id}`)}
					aria-label={post.title}
				>
					<div class="item-top">
						<span class={post.category === 'factual' ? 'badge badge-factual' : 'badge'}>
							{post.category === 'factual' ? 'Factual' : 'Community'}
						</span>
						<span class="item-time muted">{timeAgo(post.createdAt)}</span>
					</div>

					<p class="item-title">{post.title}</p>

					<div class="item-meta">
						{#if getRegion(post.regionId)}
							<span class="item-region muted">{getRegion(post.regionId)!.name}</span>
						{/if}
						<span class="item-comments muted">
							<!-- comment icon -->
							<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<path
									d="M14 1H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3l2 3 2-3h5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1z"
									stroke="currentColor"
									stroke-width="1.4"
									stroke-linejoin="round"
								/>
							</svg>
							{post.commentCount}
						</span>
						{#if post.category === 'factual' && (post.verifyCount + post.disputeCount) > 0}
							<span class="item-votes">
								<span style="color:var(--verify);font-size:11px;font-weight:600;">
									{Math.round((post.verifyCount / (post.verifyCount + post.disputeCount)) * 100)}% verified
								</span>
							</span>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</aside>

<style>
	.headline-panel {
		width: 320px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		max-height: 100%;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 16px 12px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.panel-title {
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-3);
	}

	.post-count {
		font-size: 12px;
	}

	.empty-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 32px 16px;
		text-align: center;
	}

	.headline-list {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		flex: 1;
	}

	.headline-item {
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
		cursor: pointer;
		transition: background 0.12s ease;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.headline-item:last-child {
		border-bottom: none;
	}

	.headline-item:hover,
	.headline-item.hovered {
		background: var(--surface-2);
	}

	.item-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.item-time {
		font-size: 11px;
		flex-shrink: 0;
	}

	.item-title {
		margin: 0;
		font-size: 13.5px;
		font-weight: 600;
		line-height: 1.4;
		color: var(--text);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.item-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.item-region {
		font-size: 11px;
	}

	.item-comments {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: var(--text-3);
	}

	.item-votes {
		font-size: 11px;
	}
</style>
