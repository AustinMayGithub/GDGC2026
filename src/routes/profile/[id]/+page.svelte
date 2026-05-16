<script lang="ts">
	import type { UserProfile, SessionUser } from '$lib/types';
	import { invalidateAll } from '$app/navigation';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import { getRegion } from '$lib/data/nz-regions';

	interface PageData {
		profile: UserProfile;
		isOwn: boolean;
		user: SessionUser | null;
	}

	let { data }: { data: PageData } = $props();
	let profile = $derived(data.profile);
	let isOwn = $derived(data.isOwn);
	let user = $derived(data.user);

	let editing = $state(false);
	let saving = $state(false);
	let saveError = $state('');

	let editName = $state('');
	let editBio = $state('');
	let editAge = $state('');
	let editLocation = $state('');
	let editAvatarDataUrl = $state<string | null>(null);

	function startEdit() {
		editName = profile.displayName;
		editBio = profile.bio ?? '';
		editAge = profile.age ? String(profile.age) : '';
		editLocation = profile.location ?? '';
		editAvatarDataUrl = null;
		saveError = '';
		editing = true;
	}

	function cancelEdit() {
		editing = false;
		saveError = '';
	}

	async function saveEdit() {
		saving = true;
		saveError = '';
		try {
			const body: Record<string, unknown> = {
				displayName: editName.trim(),
				bio: editBio.trim() || null,
				age: editAge ? Number(editAge) : null,
				location: editLocation.trim() || null
			};
			if (editAvatarDataUrl !== null) body.avatarDataUrl = editAvatarDataUrl;

			const res = await fetch('/api/users/me', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				saveError = (await res.text()) || 'Failed to save';
				return;
			}

			editing = false;
			await invalidateAll();
		} finally {
			saving = false;
		}
	}

	function handleAvatarChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (file.size > 2_000_000) {
			saveError = 'Image too large (max 2 MB)';
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			editAvatarDataUrl = reader.result as string;
		};
		reader.readAsDataURL(file);
	}

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.join('');
	}

	function formatJoined(iso: string): string {
		return new Date(iso).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' });
	}

	function timeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const m = Math.floor(diff / 60000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		return `${Math.floor(h / 24)}d ago`;
	}

	const repColor = $derived(
		profile.reputation.score === null
			? 'var(--text-3)'
			: profile.reputation.score >= 80
				? 'var(--verify)'
				: profile.reputation.score >= 60
					? '#65a30d'
					: profile.reputation.score >= 40
						? '#d97706'
						: 'var(--dispute)'
	);
</script>

<svelte:head>
	<title>{profile.displayName} — BirdsEye</title>
</svelte:head>

<div class="page">
	<header class="topbar">
		<a class="back-link btn" href="/">← Back to map</a>
		<span class="topbar-title gradient-text">BirdsEye</span>
		<UserMenu {user} />
	</header>

	<div class="content">
		<!-- Profile card -->
		<div class="profile-card card">
			{#if editing}
				<div class="edit-layout">
					<div class="avatar-edit-wrap">
						<label class="avatar-edit-label">
							{#if editAvatarDataUrl}
								<img class="avatar-img" src={editAvatarDataUrl} alt="" />
							{:else if profile.hasAvatar}
								<img class="avatar-img" src="/api/users/{profile.id}/avatar" alt="" />
							{:else}
								<div class="avatar-initials">{initials(editName || profile.displayName)}</div>
							{/if}
							<span class="avatar-overlay">Change photo</span>
							<input
								type="file"
								accept="image/*"
								onchange={handleAvatarChange}
								class="file-hidden"
							/>
						</label>
					</div>

					<div class="edit-fields">
						<div class="field-group">
							<label class="field-label" for="edit-name">Display name</label>
							<input
								id="edit-name"
								class="input"
								type="text"
								bind:value={editName}
								maxlength="50"
							/>
						</div>
						<div class="field-group">
							<label class="field-label" for="edit-bio">Bio</label>
							<textarea
								id="edit-bio"
								class="input textarea"
								bind:value={editBio}
								maxlength="280"
								rows="3"
								placeholder="Tell people about yourself…"
							></textarea>
						</div>
						<div class="field-row">
							<div class="field-group field-age">
								<label class="field-label" for="edit-age">Age</label>
								<input
									id="edit-age"
									class="input"
									type="number"
									bind:value={editAge}
									min="1"
									max="120"
									placeholder="—"
								/>
							</div>
							<div class="field-group field-loc">
								<label class="field-label" for="edit-loc">Location</label>
								<input
									id="edit-loc"
									class="input"
									type="text"
									bind:value={editLocation}
									maxlength="100"
									placeholder="City, Country"
								/>
							</div>
						</div>
						{#if saveError}
							<p class="error-text">{saveError}</p>
						{/if}
						<div class="edit-actions">
							<button class="btn" onclick={cancelEdit} disabled={saving}>Cancel</button>
							<button class="btn btn-primary" onclick={saveEdit} disabled={saving}>
								{saving ? 'Saving…' : 'Save changes'}
							</button>
						</div>
					</div>
				</div>
			{:else}
				<div class="profile-layout">
					<div class="avatar-area">
						{#if profile.hasAvatar}
							<img
								class="avatar-img"
								src="/api/users/{profile.id}/avatar"
								alt={profile.displayName}
							/>
						{:else}
							<div class="avatar-initials">{initials(profile.displayName)}</div>
						{/if}
					</div>
					<div class="profile-info">
						<h1 class="profile-name">{profile.displayName}</h1>
						{#if profile.bio}
							<p class="profile-bio">{profile.bio}</p>
						{/if}
						<div class="profile-meta">
							{#if profile.location}
								<span class="meta-chip">📍 {profile.location}</span>
							{/if}
							{#if profile.age}
								<span class="meta-chip">Age {profile.age}</span>
							{/if}
							<span class="meta-chip muted">Joined {formatJoined(profile.joinedAt)}</span>
						</div>
						{#if isOwn}
							<button class="btn edit-btn" onclick={startEdit}>Edit profile</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Reputation -->
		<div class="rep-card card">
			<h2 class="section-label">Reputation</h2>
			{#if profile.reputation.score !== null}
				<div class="rep-bar-track">
					<div
						class="rep-bar-fill"
						style="width: {profile.reputation.score}%; background: {repColor};"
					></div>
				</div>
				<p class="rep-verdict" style="color: {repColor};">
					{profile.reputation.score}% verified — <strong>{profile.reputation.label}</strong>
				</p>
			{:else}
				<p class="rep-unrated muted">
					{profile.reputation.postCount === 0
						? 'No posts yet.'
						: `Not enough votes yet (need 5, have ${profile.reputation.totalVotes}).`}
				</p>
			{/if}
			<p class="rep-stats muted">
				{profile.reputation.postCount}
				{profile.reputation.postCount === 1 ? 'post' : 'posts'} · {profile.reputation.totalVotes}
				total {profile.reputation.totalVotes === 1 ? 'vote' : 'votes'}
			</p>
		</div>

		<!-- Posts -->
		<section class="posts-section">
			<h2 class="posts-heading">
				{isOwn ? 'Your posts' : `Posts by ${profile.displayName}`}
				<span class="posts-count muted">({profile.posts.length})</span>
			</h2>

			{#if profile.posts.length === 0}
				<p class="no-posts muted">No posts yet.</p>
			{:else}
				<div class="posts-list">
					{#each profile.posts as post}
						{@const region = getRegion(post.regionId)}
						{@const totalVotes = post.verifyCount + post.disputeCount}
						<a class="post-item card" href="/post/{post.id}">
							<div class="post-top">
								<span class={post.category === 'factual' ? 'badge badge-factual' : 'badge'}>
									{post.category === 'factual' ? 'Factual' : 'Community'}
								</span>
								<span class="post-time muted">{timeAgo(post.createdAt)}</span>
							</div>
							<p class="post-title">{post.title}</p>
							<div class="post-meta muted">
								{#if region}<span>{region.name}</span>{/if}
								{#if post.category === 'factual' && totalVotes > 0}
									<span
										class="vote-pct"
										style="color: {post.verifyCount > post.disputeCount
											? 'var(--verify)'
											: 'var(--dispute)'};"
									>
										{Math.round((post.verifyCount / totalVotes) * 100)}% verified
									</span>
								{/if}
								<span>💬 {post.commentCount}</span>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</section>
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: var(--bg);
	}

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

	.content {
		max-width: 760px;
		margin: 0 auto;
		padding: 32px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		width: 100%;
	}

	/* ── Profile card ── */
	.profile-card {
		padding: 28px;
	}

	.profile-layout {
		display: flex;
		gap: 24px;
		align-items: flex-start;
	}

	.avatar-area {
		flex-shrink: 0;
	}

	.avatar-img {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		object-fit: cover;
		display: block;
	}

	.avatar-initials {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: var(--gradient);
		color: #fff;
		font-weight: 700;
		font-size: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.profile-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.profile-name {
		font-size: 24px;
		font-weight: 750;
		letter-spacing: -0.02em;
	}

	.profile-bio {
		margin: 0;
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-2);
	}

	.profile-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 13px;
	}

	.meta-chip {
		color: var(--text-2);
	}

	.edit-btn {
		align-self: flex-start;
		margin-top: 4px;
		font-size: 13px;
		padding: 7px 14px;
	}

	/* ── Edit mode ── */
	.edit-layout {
		display: flex;
		gap: 24px;
		align-items: flex-start;
	}

	.avatar-edit-wrap {
		flex-shrink: 0;
	}

	.avatar-edit-label {
		display: block;
		position: relative;
		width: 80px;
		height: 80px;
		border-radius: 50%;
		overflow: hidden;
		cursor: pointer;
	}

	.avatar-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		color: #fff;
		font-size: 11px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.avatar-edit-label:hover .avatar-overlay {
		opacity: 1;
	}

	.file-hidden {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.edit-fields {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.field-row {
		display: flex;
		gap: 12px;
	}

	.field-age {
		width: 90px;
		flex-shrink: 0;
	}

	.field-loc {
		flex: 1;
	}

	.field-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-2);
	}

	.textarea {
		resize: vertical;
		min-height: 72px;
	}

	.edit-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	/* ── Reputation ── */
	.rep-card {
		padding: 20px 24px;
	}

	.section-label {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-3);
		margin-bottom: 12px;
	}

	.rep-bar-track {
		height: 8px;
		border-radius: 999px;
		background: var(--surface-3);
		overflow: hidden;
		margin-bottom: 10px;
	}

	.rep-bar-fill {
		height: 100%;
		border-radius: 999px;
		transition: width 0.4s ease;
	}

	.rep-verdict {
		margin: 0 0 4px;
		font-size: 15px;
	}

	.rep-unrated {
		margin: 0 0 4px;
		font-size: 14px;
	}

	.rep-stats {
		margin: 0;
		font-size: 12px;
	}

	/* ── Posts ── */
	.posts-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.posts-heading {
		font-size: 16px;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.posts-count {
		font-weight: 400;
		font-size: 14px;
	}

	.no-posts {
		margin: 0;
		font-size: 14px;
	}

	.posts-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.post-item {
		display: block;
		padding: 16px 20px;
		transition: box-shadow 0.15s ease, transform 0.12s ease;
	}

	.post-item:hover {
		transform: translateY(-1px);
		box-shadow: var(--shadow);
	}

	.post-top {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}

	.post-time {
		font-size: 12px;
		margin-left: auto;
	}

	.post-title {
		margin: 0 0 10px;
		font-size: 15px;
		font-weight: 650;
		line-height: 1.4;
		color: var(--text);
	}

	.post-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 12px;
	}

	.vote-pct {
		font-weight: 700;
	}

	@media (max-width: 600px) {
		.content {
			padding: 20px 16px 48px;
		}
		.profile-layout,
		.edit-layout {
			flex-direction: column;
			align-items: center;
			text-align: center;
		}
		.profile-meta {
			justify-content: center;
		}
		.edit-btn {
			align-self: center;
		}
		.edit-fields {
			width: 100%;
		}
	}
</style>
