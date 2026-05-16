<script lang="ts">
	import { onMount } from 'svelte';
	import type { PostSummary } from '$lib/types';

	interface Props {
		posts: PostSummary[];
		hoveredPostId: string | null;
		getMarkerScreenPos: (id: string) => { x: number; y: number } | null;
		listItemEls: Map<string, HTMLElement>;
		redrawTrigger: number;
	}

	let { posts, hoveredPostId, getMarkerScreenPos, listItemEls, redrawTrigger }: Props = $props();

	interface Line {
		id: string;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		cx: number;
		cy: number;
		hovered: boolean;
	}

	let lines = $state<Line[]>([]);
	let svgWidth = $state(0);
	let svgHeight = $state(0);
	let rafId: number | null = null;

	function computeLines() {
		svgWidth = window.innerWidth;
		svgHeight = window.innerHeight;

		const result: Line[] = [];

		for (const post of posts) {
			const markerPos = getMarkerScreenPos(post.id);
			if (!markerPos) continue;

			const itemEl = listItemEls.get(post.id);
			if (!itemEl) continue;

			const rect = itemEl.getBoundingClientRect();
			const cardCenterX = rect.left + rect.width / 2;
			const cardCenterY = rect.top + rect.height / 2;
			const connectFromLeft = markerPos.x > cardCenterX;
			const x1 = connectFromLeft ? rect.right : rect.left;
			const y1 = Math.max(rect.top + 22, Math.min(markerPos.y, rect.bottom - 22));
			const x2 = markerPos.x;
			const y2 = markerPos.y;
			const horizontalPull = Math.abs(x2 - x1) * 0.18;
			const cx = connectFromLeft ? x1 + horizontalPull : x1 - horizontalPull;
			const cy = cardCenterY + (y2 - cardCenterY) * 0.42;

			result.push({
				id: post.id,
				x1,
				y1,
				x2,
				y2,
				cx,
				cy,
				hovered: hoveredPostId === post.id
			});
		}

		lines = result;
	}

	function scheduleRedraw() {
		if (rafId !== null) return;
		rafId = requestAnimationFrame(() => {
			rafId = null;
			computeLines();
		});
	}

	onMount(() => {
		window.addEventListener('resize', scheduleRedraw);
		scheduleRedraw();
		return () => {
			window.removeEventListener('resize', scheduleRedraw);
			if (rafId !== null) cancelAnimationFrame(rafId);
		};
	});

	$effect(() => {
		hoveredPostId;
		redrawTrigger;
		posts;
		scheduleRedraw();
	});
</script>

<svg
	class="connector-svg"
	width={svgWidth}
	height={svgHeight}
	style="width:{svgWidth}px;height:{svgHeight}px"
	aria-hidden="true"
>
	{#each lines as line (line.id)}
		<path
			d="M {line.x1} {line.y1} Q {line.cx} {line.cy} {line.x2} {line.y2}"
			stroke={line.hovered ? 'url(#connector-gradient)' : 'rgba(30, 41, 59, 0.24)'}
			stroke-width={line.hovered ? 2.35 : 1.2}
			fill="none"
			stroke-dasharray={line.hovered ? 'none' : '5 8'}
			stroke-linecap="round"
			opacity={line.hovered ? 1 : 0.92}
		/>
		<circle
			cx={line.x1}
			cy={line.y1}
			r={line.hovered ? 3.2 : 2.2}
			fill={line.hovered ? 'var(--brand-1)' : 'rgba(30, 41, 59, 0.36)'}
		/>
		<circle
			cx={line.x2}
			cy={line.y2}
			r={line.hovered ? 4.2 : 2.6}
			fill={line.hovered ? 'url(#connector-gradient)' : 'rgba(17, 24, 39, 0.3)'}
		/>
	{/each}

	<defs>
		<linearGradient id="connector-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
			<stop offset="0%" stop-color="var(--brand-1)" />
			<stop offset="100%" stop-color="var(--brand-2)" />
		</linearGradient>
	</defs>
</svg>

<style>
	.connector-svg {
		position: fixed;
		top: 0;
		left: 0;
		pointer-events: none;
		z-index: 19;
		overflow: visible;
	}

	@media (max-width: 820px) {
		.connector-svg {
			display: none;
		}
	}
</style>
