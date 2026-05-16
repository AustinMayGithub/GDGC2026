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

	const MAX_BUBBLES = 8;

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

	function bubblePosts(side: 'left' | 'right') {
		return posts
			.slice(0, MAX_BUBBLES)
			.filter((_, index) => (side === 'left' ? index % 2 === 0 : index % 2 === 1));
	}
</script>

{#if posts.length > 0}
	<div class="bubble-stage" aria-label="Recent articles across New Zealand">
		<div class="bubble-rail rail-left">
			{#each bubblePosts('left') as post (post.id)}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<article
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

					<div class="item-spacer"></div>

					<div class="item-meta">
						{#if getRegion(post.regionId)}
							<span class="item-region muted">{getRegion(post.regionId)!.name}</span>
						{/if}
						<span class="item-comments muted">
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
								{Math.round((post.verifyCount / (post.verifyCount + post.disputeCount)) * 100)}%
								verified
							</span>
						{/if}
					</div>
				</article>
			{/each}
		</div>

		<div class="bubble-rail rail-right">
			{#each bubblePosts('right') as post (post.id)}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<article
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

					<div class="item-spacer"></div>

					<div class="item-meta">
						{#if getRegion(post.regionId)}
							<span class="item-region muted">{getRegion(post.regionId)!.name}</span>
						{/if}
						<span class="item-comments muted">
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
								{Math.round((post.verifyCount / (post.verifyCount + post.disputeCount)) * 100)}%
								verified
							</span>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	</div>
{/if}

<style>
	.bubble-stage {
		position: absolute;
		inset: 110px 18px 22px;
		pointer-events: none;
		z-index: 18;
	}

	.bubble-rail {
		position: absolute;
		top: 0;
		bottom: 0;
		width: clamp(148px, 15vw, 216px);
		display: flex;
		flex-direction: column;
		justify-content: space-evenly;
		pointer-events: none;
	}

	.rail-left {
		left: clamp(16px, 2.2vw, 32px);
	}

	.rail-right {
		right: clamp(16px, 2.2vw, 32px);
	}

	.headline-item {
		width: 100%;
		aspect-ratio: 1.12;
		padding: 12px;
		border: 1px solid rgba(255, 255, 255, 0.72);
		border-radius: 16px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.84)),
			radial-gradient(circle at top, rgba(99, 102, 241, 0.08), transparent 55%);
		box-shadow: 0 22px 60px rgba(15, 23, 42, 0.12);
		backdrop-filter: blur(18px);
		cursor: pointer;
		pointer-events: auto;
		transition:
			transform 0.18s ease,
			box-shadow 0.18s ease,
			border-color 0.18s ease,
			background 0.18s ease;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.headline-item:hover,
	.headline-item.hovered {
		transform: translateY(-4px) scale(1.02);
		border-color: rgba(99, 102, 241, 0.28);
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 251, 255, 0.9)),
			radial-gradient(circle at top, rgba(99, 102, 241, 0.14), transparent 58%);
		box-shadow: 0 28px 80px rgba(99, 102, 241, 0.16);
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
		font-size: 16px;
		font-weight: 650;
		line-height: 1.4;
		color: var(--text);
		display: -webkit-box;
		line-clamp: 4;
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.item-spacer {
		flex: 1;
	}

	.item-meta {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: auto;
	}

	.item-region {
		font-size: 12px;
		font-weight: 600;
		width: 100%;
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
		font-weight: 700;
		color: var(--verify);
	}

	@media (max-width: 1100px) {
		.bubble-stage {
			inset: 118px 14px 18px;
		}

		.bubble-rail {
			width: clamp(138px, 17vw, 188px);
		}

		.headline-item {
			padding: 11px;
		}

		.item-title {
			font-size: 14px;
		}
	}

	@media (max-width: 820px) {
		.bubble-stage {
			display: none;
		}
	}
</style>
