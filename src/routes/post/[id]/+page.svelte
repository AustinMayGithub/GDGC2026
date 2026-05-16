<script lang="ts">
	import type { PostDetail, CommentItem, CommunityNote, SessionUser } from '$lib/types';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import ImpactMap from '$lib/components/ImpactMap.svelte';
	import CredibilityMeter from '$lib/components/CredibilityMeter.svelte';
	import CommunityNote from '$lib/components/CommunityNote.svelte';
	import ReactionBar from '$lib/components/ReactionBar.svelte';
	import CommentThread from '$lib/components/CommentThread.svelte';
	import logo from '$lib/data/birdseye.png';


	interface PageData {
		post: PostDetail;
		comments: CommentItem[];
		user: SessionUser | null;
	}

	let { data }: { data: PageData } = $props();

	const post = $derived(data.post);
	const comments = $derived(data.comments);
	const user = $derived(data.user);

	let rightOpen = $state(true);
	let communityNote = $state(post.communityNote);

	function formatDate(isoString: string): string {
		const date = new Date(isoString);
		return date.toLocaleDateString('en-NZ', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	async function reportPost() {
		const reason = window.prompt('Reason for reporting this post?');
		if (!reason?.trim()) return;
		await fetch(`/api/posts/${post.id}/report`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ targetType: 'post', reason: reason.trim() })
		});
		alert('Report submitted. Thank you.');
	}

	$effect(() => {
		communityNote = post.communityNote;
	});
</script>

<svelte:head>
	<title>{post.title} — BirdsEye</title>
</svelte:head>

<div class="page" class:right-open={rightOpen}>
	<!-- Top bar -->
	<header class="topbar">
		<a class="back-link btn" href="/">
			← Back to map
		</a>
		<span class="topbar-title gradient-text"><img alt="logo" src={logo} height="24px"></span>
		<UserMenu {user} />
	</header>

	<div class="layout">
		<!-- LEFT: article -->
		<main class="article-col">
			<article class="article card">
				{#if post.headerImageDataUrl}
					<img class="header-image" src={post.headerImageDataUrl} alt="" />
				{/if}

				<!-- Category + meta row -->
				<div class="article-meta">
					{#if post.category === 'factual'}
						<span class="badge badge-factual">Factual</span>
					{:else}
						<span class="badge">Community notice</span>
					{/if}
					<span class="muted meta-sep">·</span>
					<span class="muted author">{post.authorName}</span>
					<span class="muted meta-sep">·</span>
					<time class="muted" datetime={post.createdAt}>{formatDate(post.createdAt)}</time>
				</div>

				<h1 class="article-title">{post.title}</h1>

				<div class="article-body">
					{#each post.body.split('\n') as paragraph}
						{#if paragraph.trim()}
							<p>{paragraph}</p>
						{/if}
					{/each}
				</div>

				{#if user}
					<button class="report-post-btn muted" onclick={reportPost}>
						⚑ Report this post
					</button>
				{/if}
			</article>
		</main>

		<!-- RIGHT: collapsible panel -->
		<aside class="right-panel" class:collapsed={!rightOpen}>
			<button
				class="toggle-btn"
				onclick={() => (rightOpen = !rightOpen)}
				aria-label={rightOpen ? 'Collapse panel' : 'Expand panel'}
				title={rightOpen ? 'Collapse' : 'Expand'}
			>
				{rightOpen ? '›' : '‹'}
			</button>

			{#if rightOpen}
				<div class="panel-inner">
					<!-- 1. Impact Map -->
					<section class="panel-section map-section">
						<h2 class="section-heading">Affected area</h2>
						<div class="map-wrapper">
							<ImpactMap lng={post.lng} lat={post.lat} radiusM={post.impactRadiusM} />
						</div>
					</section>

					{#if post.category === 'factual'}
						<!-- 2. Credibility meter — sticky -->
						<div class="sticky-meter">
							<CredibilityMeter {post} {user} />
						</div>

						<!-- 3. Community note -->
						<section class="panel-section">
							<CommunityNote note={communityNote} />
						</section>
					{/if}

					<!-- 4. Reactions -->
					<section class="panel-section">
						<h2 class="section-heading">Reactions</h2>
						<ReactionBar postId={post.id} reactions={post.reactions} {user} />
					</section>

					<!-- 5. Comments -->
					<section class="panel-section">
						<CommentThread
							postId={post.id}
							{comments}
							{user}
							onCommunityNoteUpdated={(note: CommunityNote) => (communityNote = note)}
						/>
					</section>
				</div>
			{/if}
		</aside>
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: var(--bg);
	}

	/* Top bar */
	.topbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 24px;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		position: sticky;
		top: 0;
		z-index: 30;
	}
	.back-link {
		font-size: 13px;
		padding: 7px 14px;
		white-space: nowrap;
	}
	.topbar-title {
		font-size: 18px;
		font-weight: 800;
		letter-spacing: -0.03em;
		flex: 1;
		text-align: center;
	}

	/* Split layout */
	.layout {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	/* Article column */
	.article-col {
		flex: 1;
		min-width: 0;
		padding: 32px 40px;
		overflow-y: auto;
	}

	.article {
		max-width: 720px;
		margin: 0 auto;
		padding: 32px;
		overflow: hidden;
	}

	.header-image {
		display: block;
		width: calc(100% + 64px);
		aspect-ratio: 20 / 9;
		height: auto;
		object-fit: cover;
		margin: -32px -32px 28px;
		background: var(--surface-2);
		border-bottom: 1px solid var(--border);
	}

	.article-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 16px;
		font-size: 13px;
	}
	.meta-sep { user-select: none; }
	.author { font-weight: 550; }

	.article-title {
		font-size: clamp(22px, 3vw, 32px);
		line-height: 1.2;
		letter-spacing: -0.02em;
		margin-bottom: 24px;
		color: var(--text);
	}

	.article-body {
		font-size: 16px;
		line-height: 1.75;
		color: var(--text);
	}
	.article-body p {
		margin: 0 0 16px;
	}
	.article-body p:last-child {
		margin-bottom: 0;
	}

	.report-post-btn {
		margin-top: 24px;
		border: none;
		background: none;
		font-size: 12px;
		cursor: pointer;
		padding: 0;
	}
	.report-post-btn:hover {
		color: var(--dispute);
	}

	/* Right panel */
	.right-panel {
		width: 380px;
		flex-shrink: 0;
		border-left: 1px solid var(--border);
		display: flex;
		position: relative;
		background: var(--surface);
		overflow: hidden;
		transition: width 0.25s ease;
	}
	.right-panel.collapsed {
		width: 36px;
	}

	.toggle-btn {
		position: absolute;
		left: 0;
		top: 50%;
		transform: translateY(-50%);
		width: 28px;
		height: 56px;
		border: none;
		border-right: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: 18px;
		cursor: pointer;
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s;
	}
	.toggle-btn:hover {
		background: var(--surface-3);
	}

	.panel-inner {
		flex: 1;
		overflow-y: auto;
		padding: 20px 16px 40px 44px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.section-heading {
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-3);
		margin-bottom: 10px;
	}

	.panel-section {
		display: flex;
		flex-direction: column;
	}

	.map-section .map-wrapper {
		height: 200px;
		border-radius: var(--radius);
		overflow: hidden;
	}

	/* Sticky meter */
	.sticky-meter {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--surface);
		padding-bottom: 4px;
	}

	/* Responsive: stack on small screens */
	@media (max-width: 768px) {
		.layout {
			flex-direction: column;
		}
		.article-col {
			padding: 20px 16px;
		}
		.right-panel {
			width: 100%;
			border-left: none;
			border-top: 1px solid var(--border);
		}
		.right-panel.collapsed {
			width: 100%;
			height: 36px;
			overflow: hidden;
		}
		.toggle-btn {
			left: 50%;
			top: 0;
			transform: translateX(-50%);
			width: 56px;
			height: 28px;
			border-right: none;
			border-bottom: 1px solid var(--border);
			border-radius: 0 0 var(--radius-sm) var(--radius-sm);
		}
		.panel-inner {
			padding: 44px 16px 32px;
		}
		.sticky-meter {
			position: static;
		}
	}
</style>
