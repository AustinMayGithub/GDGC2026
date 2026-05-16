<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
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
			// Only draw line for hovered post (hover-only fallback approach)
			if (hoveredPostId !== null && hoveredPostId !== post.id) continue;
			if (hoveredPostId === null) continue;

			const markerPos = getMarkerScreenPos(post.id);
			if (!markerPos) continue;

			const itemEl = listItemEls.get(post.id);
			if (!itemEl) continue;

			const rect = itemEl.getBoundingClientRect();
			// Right edge midpoint of list item
			const x1 = rect.right;
			const y1 = rect.top + rect.height / 2;

			// Marker position is already in viewport (document) coordinates
			const x2 = markerPos.x;
			const y2 = markerPos.y;

			// Quadratic bezier control point — pull toward horizontal centre
			const cx = (x1 + x2) / 2;
			const cy = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.12;

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
		// Trigger recompute whenever any reactive input changes
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
			stroke={line.hovered ? 'url(#connector-gradient)' : 'rgba(99,102,241,0.25)'}
			stroke-width={line.hovered ? 2 : 1}
			fill="none"
			stroke-dasharray={line.hovered ? 'none' : '4 4'}
			stroke-linecap="round"
		/>
		<!-- Terminal dot at headline -->
		{#if line.hovered}
			<circle cx={line.x1} cy={line.y1} r="3" fill="var(--brand-1)" opacity="0.7" />
			<!-- Terminal dot at marker -->
			<circle cx={line.x2} cy={line.y2} r="4" fill="url(#connector-gradient)" opacity="0.9" />
		{/if}
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
		z-index: 30;
		overflow: visible;
	}
</style>
