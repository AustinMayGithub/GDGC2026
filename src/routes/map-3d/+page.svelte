<script lang="ts">
	import { onMount } from 'svelte';
	import ThreeDMap from '$lib/components/ThreeDMap.svelte';
	import type { PostSummary } from '$lib/types';

	let posts = $state<PostSummary[]>([]);
	let loading = $state(true);
	let notice = $state('');

	const samplePosts: PostSummary[] = [
		{
			id: 'sample-auckland',
			title: 'Harbour bridge traffic incident',
			category: 'factual',
			lng: 174.746,
			lat: -36.831,
			impactRadiusM: 3600,
			regionId: 'auckland',
			authorId: 'sample',
			authorName: 'BirdsEye',
			createdAt: new Date().toISOString(),
			commentCount: 12,
			reactionCount: 28,
			verifyCount: 18,
			disputeCount: 2,
			hasImage: false,
			anonymous: false,
			areaLabel: 'Auckland harbour area'
		},
		{
			id: 'sample-wellington',
			title: 'CBD power outage reports',
			category: 'factual',
			lng: 174.777,
			lat: -41.289,
			impactRadiusM: 2200,
			regionId: 'wellington',
			authorId: 'sample',
			authorName: 'BirdsEye',
			createdAt: new Date().toISOString(),
			commentCount: 8,
			reactionCount: 15,
			verifyCount: 5,
			disputeCount: 5,
			hasImage: false,
			anonymous: false,
			areaLabel: 'Central Wellington'
		},
		{
			id: 'sample-christchurch',
			title: 'Roadworks near Cathedral Square',
			category: 'personal',
			lng: 172.637,
			lat: -43.531,
			impactRadiusM: 1800,
			regionId: 'canterbury',
			authorId: 'sample',
			authorName: 'BirdsEye',
			createdAt: new Date().toISOString(),
			commentCount: 4,
			reactionCount: 9,
			verifyCount: 2,
			disputeCount: 7,
			hasImage: false,
			anonymous: false,
			areaLabel: 'Central Christchurch'
		}
	];

	async function loadPosts() {
		loading = true;
		try {
			const response = await fetch('/api/posts?scope=national');
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const json = (await response.json()) as { posts?: PostSummary[] };
			posts = json.posts?.length ? json.posts : samplePosts;
			notice = json.posts?.length
				? `${json.posts.length} live posts rendered as 3D story towers.`
				: 'No live posts yet, so this test page is using sample story towers.';
		} catch {
			posts = samplePosts;
			notice = 'Database/API unavailable, so this test page is using sample story towers.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadPosts();
	});
</script>

<svelte:head>
	<title>3D Map Test | BirdsEye</title>
</svelte:head>

<div class="page">
	<header class="topbar">
		<a class="back-link" href="/">Back</a>
		<div>
			<h1>3D Map Test</h1>
			<p>{loading ? 'Loading the 3D scene...' : notice}</p>
		</div>
	</header>

	<main class="map-shell">
		<ThreeDMap {posts} />
	</main>
</div>

<style>
	.page {
		height: 100vh;
		overflow: hidden;
		background: #f4f7f8;
		color: var(--text);
	}

	.topbar {
		position: absolute;
		top: 18px;
		left: 18px;
		z-index: 4;
		display: flex;
		align-items: center;
		gap: 14px;
		width: min(430px, calc(100vw - 36px));
		padding: 12px 14px;
		border: 1px solid rgba(255, 255, 255, 0.74);
		border-radius: var(--radius-lg);
		background: rgba(255, 255, 255, 0.86);
		backdrop-filter: blur(16px);
		box-shadow: 0 16px 34px rgba(15, 23, 42, 0.12);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 34px;
		flex: 0 0 auto;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-size: 13px;
		font-weight: 750;
	}

	h1 {
		font-size: 16px;
		line-height: 1.15;
	}

	p {
		margin: 3px 0 0;
		color: var(--text-2);
		font-size: 12px;
		line-height: 1.35;
	}

	.map-shell {
		height: 100%;
	}

	@media (max-width: 760px) {
		.topbar {
			top: 70px;
			left: 12px;
			width: calc(100vw - 24px);
		}
	}
</style>
