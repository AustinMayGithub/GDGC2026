<script lang="ts">
	import type { PostImage } from '$lib/types';

	interface Props {
		images: PostImage[];
		flush?: boolean;
		flushMode?: 'article' | 'panel';
	}

	let { images, flush = false, flushMode = 'article' }: Props = $props();
	let activeIndex = $state(0);
	let touchStartX: number | null = null;

	const activeImage = $derived(images[activeIndex] ?? images[0] ?? null);
	const hasMultiple = $derived(images.length > 1);

	$effect(() => {
		images;
		if (activeIndex >= images.length) activeIndex = Math.max(0, images.length - 1);
	});

	function showPrevious() {
		if (!hasMultiple) return;
		activeIndex = activeIndex === 0 ? images.length - 1 : activeIndex - 1;
	}

	function showNext() {
		if (!hasMultiple) return;
		activeIndex = activeIndex === images.length - 1 ? 0 : activeIndex + 1;
	}

	function handleTouchStart(event: TouchEvent) {
		touchStartX = event.touches[0]?.clientX ?? null;
	}

	function handleTouchEnd(event: TouchEvent) {
		if (touchStartX === null) return;
		const endX = event.changedTouches[0]?.clientX ?? touchStartX;
		const delta = endX - touchStartX;
		touchStartX = null;
		if (Math.abs(delta) < 38) return;
		if (delta < 0) showNext();
		else showPrevious();
	}
</script>

{#if activeImage}
	<div
		class="gallery"
		class:flush
		class:panel={flushMode === 'panel'}
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
	>
		<img src={activeImage.dataUrl} alt="" />

		{#if hasMultiple}
			<button type="button" class="nav previous" aria-label="Previous image" onclick={showPrevious}>
				<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</button>
			<button type="button" class="nav next" aria-label="Next image" onclick={showNext}>
				<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</button>

			<div class="counter">{activeIndex + 1}/{images.length}</div>
			<div class="dots" aria-label="Image gallery position">
				{#each images as image, index (image.id)}
					<button
						type="button"
						class:active={index === activeIndex}
						aria-label={`Show image ${index + 1}`}
						onclick={() => (activeIndex = index)}
					></button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.gallery {
		position: relative;
		width: 100%;
		aspect-ratio: 20 / 9;
		overflow: hidden;
		border-radius: var(--radius);
		background: var(--surface-2);
		border: 1px solid var(--border);
	}

	.gallery.flush {
		width: calc(100% + 64px);
		margin: -32px -32px 28px;
		border-radius: 0;
		border-left: none;
		border-right: none;
		border-top: none;
	}

	.gallery.flush.panel {
		width: calc(100% + 48px);
		margin: -24px -24px 0;
	}

	.gallery img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 34px;
		height: 34px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(255, 255, 255, 0.75);
		border-radius: 999px;
		background: rgba(20, 20, 26, 0.58);
		color: #fff;
		backdrop-filter: blur(10px);
	}

	.nav:hover {
		background: rgba(20, 20, 26, 0.72);
	}

	.previous {
		left: 12px;
	}

	.next {
		right: 12px;
	}

	.counter {
		position: absolute;
		top: 10px;
		right: 10px;
		padding: 3px 8px;
		border-radius: 999px;
		background: rgba(20, 20, 26, 0.62);
		color: #fff;
		font-size: 12px;
		font-weight: 750;
		backdrop-filter: blur(10px);
	}

	.dots {
		position: absolute;
		left: 50%;
		bottom: 10px;
		transform: translateX(-50%);
		display: flex;
		gap: 5px;
		padding: 5px 7px;
		border-radius: 999px;
		background: rgba(20, 20, 26, 0.46);
		backdrop-filter: blur(10px);
	}

	.dots button {
		width: 7px;
		height: 7px;
		padding: 0;
		border: none;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.52);
	}

	.dots button.active {
		width: 18px;
		background: #fff;
	}

	@media (max-width: 720px) {
		.gallery.flush {
			width: calc(100% + 36px);
			margin: -18px -18px 18px;
		}

		.gallery.flush.panel {
			width: calc(100% + 36px);
			margin: -18px -18px 0;
		}
	}
</style>
