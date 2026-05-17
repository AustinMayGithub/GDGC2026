<script lang="ts">
	import { flip } from 'svelte/animate';
	import type { PostSummary } from '$lib/types';
	import { getRegion } from '$lib/data/nz-regions';
	import { timeAgo } from '$lib/time';
	import { fly } from 'svelte/transition';

	interface Props {
		posts: PostSummary[];
		hoveredPostId: string | null;
		onHover: (id: string | null) => void;
		onSelect: (id: string) => void;
		listItemEls: Map<string, HTMLElement>;
	}

	const SIDES = ['left', 'right'] as const;
	let { posts, hoveredPostId, onHover, onSelect, listItemEls }: Props = $props();

	function registerEl(el: HTMLElement, postId: string) {
		listItemEls.set(postId, el);
		return {
			destroy() {
				listItemEls.delete(postId);
			}
		};
	}

	function bubblePosts(side: (typeof SIDES)[number]) {
		return posts.filter((_, index) => (side === 'left' ? index % 2 === 0 : index % 2 === 1));
	}

	function voteStatus(post: PostSummary) {
		const total = post.verifyCount + post.disputeCount;
		if (total === 0) return 'untouched';
		const verifyRatio = post.verifyCount / total;
		if (verifyRatio >= 0.4 && verifyRatio <= 0.6) return 'mixed';
		return verifyRatio > 0.6 ? 'reliable' : 'needs-review';
	}
</script>

{#if posts.length > 0}
	<div class="bubble-stage" aria-label="Recent articles across New Zealand">
		{#each SIDES as side}
			<div class={`bubble-rail rail-${side}`}>
				{#each bubblePosts(side) as post (post.id)}
					{@const region = getRegion(post.regionId)}
					<div
						class="headline-slot"
						animate:flip={{ duration: 320 }}
						in:fly={{ x: side === 'left' ? -36 : 36, y: 0, duration: 340, delay: 80 }}
						out:fly={{ x: side === 'left' ? -80 : 80, y: 0, duration: 400 }}
					>
						<button
							type="button"
							use:registerEl={post.id}
							class="headline-item"
							class:hovered={hoveredPostId === post.id}
							class:has-image={post.hasImage}
							onmouseenter={() => onHover(post.id)}
							onmouseleave={() => onHover(null)}
							onclick={() => onSelect(post.id)}
							aria-label={post.title}
						>
							{#if post.hasImage}
								<img
									class="item-thumb"
									src="/api/posts/{post.id}/image"
									alt=""
									loading="lazy"
								/>
							{/if}
							<div class="item-top">
								{#if post.category === 'personal'}
									<span class="badge">Community</span>
								{/if}
								<span class="item-time muted">{timeAgo(post.createdAt)}</span>
							</div>

							<p class="item-title">{post.title}</p>

							<div class="item-spacer"></div>

							<div class="item-meta">
								{#if region}
									<span class="item-region muted">{region.name}</span>
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
								{#if post.category === 'factual' && post.verifyCount + post.disputeCount > 0}
									<span class={`item-votes vote-${voteStatus(post)}`}>
										{Math.round((post.verifyCount / (post.verifyCount + post.disputeCount)) * 100)}%
										reliable
									</span>
								{/if}
							</div>
						</button>
					</div>
				{/each}
			</div>
		{/each}
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
		width: clamp(180px, 18vw, 272px);
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

	.item-thumb {
		display: block;
		width: calc(100% + 24px);
		height: 72px;
		object-fit: cover;
		margin: -12px -12px 2px;
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		flex-shrink: 0;
	}

	.headline-item {
		width: 100%;
		aspect-ratio: 1.32;
		overflow: hidden;
		padding: 12px;
		border: 1px solid rgba(255, 255, 255, 0.72);
		border-radius: var(--radius-lg);
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.84)),
			radial-gradient(circle at top, rgba(99, 102, 241, 0.08), transparent 55%);
		box-shadow: 0 22px 60px rgba(15, 23, 42, 0.12);
		backdrop-filter: blur(18px);
		color: inherit;
		cursor: pointer;
		pointer-events: auto;
		text-align: left;
		transition:
			transform 0.18s ease,
			box-shadow 0.18s ease,
			border-color 0.18s ease,
			background 0.18s ease;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.headline-slot {
		width: 100%;
		pointer-events: auto;
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
		margin-left: auto;
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

	.headline-item.has-image .item-title {
		line-clamp: 2;
		-webkit-line-clamp: 2;
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
	.item-votes.vote-reliable {
		color: #16a34a;
	}
	.item-votes.vote-needs-review {
		color: #dc2626;
	}
	.item-votes.vote-mixed {
		color: #ca8a04;
	}

	@media (max-width: 1100px) {
		.bubble-stage {
			inset: 118px 14px 18px;
		}

		.bubble-rail {
			width: clamp(164px, 20vw, 236px);
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
