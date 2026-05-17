<script lang="ts">
	import { untrack } from 'svelte';
	import { timeAgo } from '$lib/time';
	import type {
		CommentItem,
		CommentReactionValue,
		CommunityNote,
		SessionUser
	} from '$lib/types';

	interface Props {
		postId: string;
		comments: CommentItem[];
		user: SessionUser | null;
		onCommunityNoteUpdated?: (note: CommunityNote) => void;
	}

	let {
		postId,
		comments: initialComments,
		user,
		onCommunityNoteUpdated = () => {}
	}: Props = $props();

	let comments = $state<CommentItem[]>([]);
	let body = $state('');
	let submitting = $state(false);
	let submittingReplyId = $state<string | null>(null);
	let submitError = $state('');
	let replyingToId = $state<string | null>(null);
	let replyDrafts = $state<Record<string, string>>({});
	let reactingIds = $state<Set<string>>(new Set());
	let deletingIds = $state<Set<string>>(new Set());
	let failedAvatars = $state<Set<string>>(new Set());

	let topLevelComments = $derived(comments.filter((comment) => !comment.parentId));
	let repliesByParent = $derived.by(() => {
		const groups = new Map<string, CommentItem[]>();
		for (const comment of comments) {
			if (!comment.parentId) continue;
			const replies = groups.get(comment.parentId) ?? [];
			replies.push(comment);
			groups.set(comment.parentId, replies);
		}
		return groups;
	});

	function getReplies(commentId: string) {
		return repliesByParent.get(commentId) ?? [];
	}

	function updateComment(commentId: string, patch: Partial<CommentItem>) {
		comments = comments.map((comment) =>
			comment.id === commentId ? { ...comment, ...patch } : comment
		);
	}

	function makeOptimisticComment(text: string, parentId: string | null): CommentItem {
		return {
			id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			parentId,
			authorId: user!.id,
			authorName: user!.displayName,
			authorHasAvatar: user!.hasAvatar,
			body: text,
			createdAt: new Date().toISOString(),
			likeCount: 0,
			dislikeCount: 0,
			myReaction: null
		};
	}

	function optimisticReaction(comment: CommentItem, reaction: CommentReactionValue): Partial<CommentItem> {
		const nextReaction = comment.myReaction === reaction ? null : reaction;
		let likeCount = comment.likeCount;
		let dislikeCount = comment.dislikeCount;

		if (comment.myReaction === 'like') likeCount = Math.max(0, likeCount - 1);
		if (comment.myReaction === 'dislike') dislikeCount = Math.max(0, dislikeCount - 1);
		if (nextReaction === 'like') likeCount += 1;
		if (nextReaction === 'dislike') dislikeCount += 1;

		return { likeCount, dislikeCount, myReaction: nextReaction };
	}

	async function submitComment(parentId: string | null = null) {
		const draft = parentId ? (replyDrafts[parentId] ?? '') : body;
		if (!draft.trim() || submitting || submittingReplyId) return;
		submitError = '';
		if (parentId) submittingReplyId = parentId;
		else submitting = true;

		const sentBody = draft.trim();
		const optimistic = makeOptimisticComment(sentBody, parentId);
		comments = [...comments, optimistic];
		if (parentId) replyDrafts = { ...replyDrafts, [parentId]: '' };
		else body = '';
		replyingToId = null;
		submitting = false;
		submittingReplyId = null;

		try {
			const res = await fetch(`/api/posts/${postId}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ body: sentBody, parentId })
			});
			const data = await res.json().catch(() => ({}));
			if (res.ok && data.comment) {
				comments = comments.map((comment) =>
					comment.id === optimistic.id ? data.comment : comment
				);
				if (data.communityNote) onCommunityNoteUpdated(data.communityNote);
			} else {
				submitError = data.message ?? 'Failed to post comment';
				comments = comments.filter((comment) => comment.id !== optimistic.id);
				if (parentId) {
					replyingToId = parentId;
					if (!(replyDrafts[parentId] ?? '').trim()) {
						replyDrafts = { ...replyDrafts, [parentId]: sentBody };
					}
				} else if (!body.trim()) {
					body = sentBody;
				}
			}
		} catch {
			submitError = 'Network error';
			comments = comments.filter((comment) => comment.id !== optimistic.id);
			if (parentId) {
				replyingToId = parentId;
				if (!(replyDrafts[parentId] ?? '').trim()) {
					replyDrafts = { ...replyDrafts, [parentId]: sentBody };
				}
			} else if (!body.trim()) {
				body = sentBody;
			}
		}
	}

	async function reactToComment(comment: CommentItem, reaction: CommentReactionValue) {
		if (!user || reactingIds.has(comment.id)) return;
		const previous = {
			likeCount: comment.likeCount,
			dislikeCount: comment.dislikeCount,
			myReaction: comment.myReaction
		};
		reactingIds = new Set([...reactingIds, comment.id]);
		submitError = '';
		updateComment(comment.id, optimisticReaction(comment, reaction));

		try {
			const res = await fetch(`/api/posts/${postId}/comments/${comment.id}/react`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reaction })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				submitError = data.message ?? 'Failed to update comment reaction';
				updateComment(comment.id, previous);
				return;
			}
			updateComment(comment.id, {
				likeCount: data.likeCount ?? 0,
				dislikeCount: data.dislikeCount ?? 0,
				myReaction: data.myReaction ?? null
			});
			if (data.communityNote) onCommunityNoteUpdated(data.communityNote);
		} catch {
			submitError = 'Network error';
			updateComment(comment.id, previous);
		} finally {
			const next = new Set(reactingIds);
			next.delete(comment.id);
			reactingIds = next;
		}
	}

	async function deleteComment(comment: CommentItem) {
		if (!user || user.id !== comment.authorId) return;
		if (deletingIds.has(comment.id) || comment.id.startsWith('optimistic-')) return;
		if (!confirm('Delete this comment? This cannot be undone.')) return;

		deletingIds = new Set([...deletingIds, comment.id]);
		submitError = '';
		try {
			const res = await fetch(`/api/posts/${postId}/comments/${comment.id}`, {
				method: 'DELETE'
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				submitError = data.message ?? 'Failed to delete comment';
				return;
			}
			// Drop the comment along with any of its replies.
			comments = comments.filter((c) => c.id !== comment.id && c.parentId !== comment.id);
			if (data.communityNote) onCommunityNoteUpdated(data.communityNote);
		} catch {
			submitError = 'Network error';
		} finally {
			const next = new Set(deletingIds);
			next.delete(comment.id);
			deletingIds = next;
		}
	}

	function handleKeydown(e: KeyboardEvent, parentId: string | null = null) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			submitComment(parentId);
		}
	}

	function toggleReply(commentId: string) {
		replyingToId = replyingToId === commentId ? null : commentId;
		submitError = '';
	}

	function markAvatarFailed(authorId: string) {
		failedAvatars = new Set([...failedAvatars, authorId]);
	}

	// Re-sync from the prop only when the post itself changes. Reading
	// `initialComments` untracked keeps a parent re-render from wiping
	// locally-posted (optimistic) comments back to a stale snapshot.
	$effect(() => {
		postId;
		untrack(() => {
			comments = [...initialComments];
			replyingToId = null;
			replyDrafts = {};
			submitError = '';
		});
	});
</script>

<div class="thread">
	<h3 class="thread-heading">
		Comments
		{#if comments.length > 0}
			<span class="count-badge">{comments.length}</span>
		{/if}
	</h3>

	{#if comments.length === 0}
		<p class="empty muted">No comments yet. Start the conversation.</p>
	{:else}
		<div class="comment-list">
			{#each topLevelComments as comment (comment.id)}
				<article class="comment">
					<div class="comment-rail">
						<span class="avatar-circle">
							{#if comment.authorHasAvatar && !failedAvatars.has(comment.authorId)}
								<img
									class="comment-avatar-img"
									src="/api/users/{comment.authorId}/avatar"
									alt=""
									onerror={() => markAvatarFailed(comment.authorId)}
								/>
							{:else}
								{comment.authorName[0]?.toUpperCase() ?? '?'}
							{/if}
						</span>
					</div>
					<div class="comment-main">
						<div class="comment-meta">
							<div class="comment-author-block">
								<span class="author-name">{comment.authorName}</span>
								<span class="time muted">{timeAgo(comment.createdAt)}</span>
							</div>
						</div>
						<p class="comment-body">{comment.body}</p>

						<div class="comment-actions">
							<button
								class:active={comment.myReaction === 'like'}
								class="comment-action"
								disabled={!user || reactingIds.has(comment.id) || comment.id.startsWith('optimistic-')}
								onclick={() => reactToComment(comment, 'like')}
								aria-label="Like comment"
							>
								Like <span>{comment.likeCount}</span>
							</button>
							<button
								class:active={comment.myReaction === 'dislike'}
								class="comment-action"
								disabled={!user || reactingIds.has(comment.id) || comment.id.startsWith('optimistic-')}
								onclick={() => reactToComment(comment, 'dislike')}
								aria-label="Dislike comment"
							>
								Dislike <span>{comment.dislikeCount}</span>
							</button>
							{#if user}
								<button class="comment-action" onclick={() => toggleReply(comment.id)}>
									Reply
								</button>
								{#if user.id === comment.authorId}
									<button
										class="comment-action danger"
										disabled={deletingIds.has(comment.id) || comment.id.startsWith('optimistic-')}
										onclick={() => deleteComment(comment)}
									>
										{deletingIds.has(comment.id) ? 'Deleting…' : 'Delete'}
									</button>
								{/if}
							{/if}
						</div>

						{#if replyingToId === comment.id && user}
							<div class="reply-compose">
								<textarea
									class="input reply-input"
									placeholder="Reply to {comment.authorName}"
									bind:value={replyDrafts[comment.id]}
									onkeydown={(e) => handleKeydown(e, comment.id)}
									rows={2}
									disabled={submittingReplyId === comment.id}
								></textarea>
								<div class="reply-actions">
									<button
										class="btn btn-primary"
										onclick={() => submitComment(comment.id)}
										disabled={submittingReplyId === comment.id || !replyDrafts[comment.id]?.trim()}
									>
										{submittingReplyId === comment.id ? 'Replying...' : 'Reply'}
									</button>
									<button class="btn" onclick={() => { replyingToId = null; }}>
										Back
									</button>
								</div>
							</div>
						{/if}

						{#if getReplies(comment.id).length > 0}
							<div class="reply-list">
								{#each getReplies(comment.id) as reply (reply.id)}
									<article class="comment reply">
										<div class="comment-rail">
											<span class="avatar-circle small">
												{#if reply.authorHasAvatar && !failedAvatars.has(reply.authorId)}
													<img
														class="comment-avatar-img"
														src="/api/users/{reply.authorId}/avatar"
														alt=""
														onerror={() => markAvatarFailed(reply.authorId)}
													/>
												{:else}
													{reply.authorName[0]?.toUpperCase() ?? '?'}
												{/if}
											</span>
										</div>
										<div class="comment-main">
											<div class="comment-meta">
												<div class="comment-author-block">
													<span class="author-name">{reply.authorName}</span>
													<span class="time muted">{timeAgo(reply.createdAt)}</span>
												</div>
											</div>
											<p class="comment-body">{reply.body}</p>
											<div class="comment-actions">
												<button
													class:active={reply.myReaction === 'like'}
													class="comment-action"
													disabled={!user || reactingIds.has(reply.id) || reply.id.startsWith('optimistic-')}
													onclick={() => reactToComment(reply, 'like')}
													aria-label="Like reply"
												>
													Like <span>{reply.likeCount}</span>
												</button>
												<button
													class:active={reply.myReaction === 'dislike'}
													class="comment-action"
													disabled={!user || reactingIds.has(reply.id) || reply.id.startsWith('optimistic-')}
													onclick={() => reactToComment(reply, 'dislike')}
													aria-label="Dislike reply"
												>
													Dislike <span>{reply.dislikeCount}</span>
												</button>
												{#if user && user.id === reply.authorId}
													<button
														class="comment-action danger"
														disabled={deletingIds.has(reply.id) || reply.id.startsWith('optimistic-')}
														onclick={() => deleteComment(reply)}
													>
														{deletingIds.has(reply.id) ? 'Deleting…' : 'Delete'}
													</button>
												{/if}
											</div>
										</div>
									</article>
								{/each}
							</div>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	{/if}

	{#if submitError}
		<p class="error-text">{submitError}</p>
	{/if}

	{#if user}
		<div class="compose-box">
			<div class="compose-header">
				<span class="avatar-circle own">
					{#if user.hasAvatar && !failedAvatars.has(user.id)}
						<img
							class="comment-avatar-img"
							src="/api/users/{user.id}/avatar"
							alt=""
							onerror={() => markAvatarFailed(user.id)}
						/>
					{:else}
						{user.displayName[0]?.toUpperCase() ?? '?'}
					{/if}
				</span>
				<span class="compose-name">{user.displayName}</span>
			</div>
			<textarea
				class="input comment-input"
				placeholder="Add a comment... (Ctrl+Enter to submit)"
				bind:value={body}
				onkeydown={(e) => handleKeydown(e)}
				rows={3}
				disabled={submitting}
			></textarea>
			<div class="compose-footer">
				<button
					class="btn btn-primary"
					onclick={() => submitComment()}
					disabled={submitting || !body.trim()}
				>
					{submitting ? 'Posting...' : 'Post comment'}
				</button>
			</div>
		</div>
	{:else}
		<div class="sign-in-card card">
			<p class="muted">
				<a href="/auth/login" class="link">Sign in</a> to join the discussion.
			</p>
		</div>
	{/if}
</div>

<style>
	.thread {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.thread-heading {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		font-weight: 750;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.count-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text-2);
		font-size: 11px;
		font-weight: 700;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 999px;
	}
	.comment-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: rgba(255, 255, 255, 0.72);
		overflow: hidden;
	}
	.comment {
		display: grid;
		grid-template-columns: 32px minmax(0, 1fr);
		gap: 10px;
		padding: 14px;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}
	.comment:last-child {
		border-bottom: none;
	}
	.comment.reply {
		grid-template-columns: 28px minmax(0, 1fr);
		padding: 11px 0 0;
		border-bottom: none;
		background: transparent;
	}
	.comment-rail {
		position: relative;
		display: flex;
		justify-content: center;
		padding-top: 2px;
	}
	.comment:not(:last-child) .comment-rail::after {
		content: '';
		position: absolute;
		top: 34px;
		bottom: -16px;
		left: 50%;
		width: 1px;
		background: var(--border);
		transform: translateX(-50%);
	}
	.comment.reply .comment-rail::after {
		display: none;
	}
	.comment-main {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.comment-meta {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}
	.avatar-circle {
		position: relative;
		z-index: 1;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		color: var(--text);
		font-size: 11px;
		font-weight: 800;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}
	.avatar-circle.small {
		width: 24px;
		height: 24px;
		font-size: 10px;
		box-shadow: none;
	}
	.comment-avatar-img {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: cover;
	}
	.avatar-circle.own {
		background: var(--text);
		border-color: var(--text);
		color: #fff;
	}
	.comment-author-block {
		min-width: 0;
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 6px;
	}
	.author-name {
		min-width: 0;
		font-weight: 750;
		font-size: 13px;
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.time {
		font-size: 11px;
		line-height: 1.25;
	}
	.comment-body {
		margin: 0;
		font-size: 14px;
		line-height: 1.55;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.comment-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
	}
	.comment-action {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: rgba(255, 255, 255, 0.7);
		color: var(--text-2);
		padding: 4px 8px;
		font-size: 11px;
		font-weight: 750;
		line-height: 1;
		cursor: pointer;
	}
	.comment-action span {
		color: var(--text-3);
		font-weight: 800;
	}
	.comment-action:hover:not(:disabled),
	.comment-action.active {
		border-color: rgba(16, 122, 95, 0.28);
		background: rgba(236, 253, 245, 0.82);
		color: var(--accent);
	}
	.comment-action.danger:hover {
		border-color: rgba(220, 38, 38, 0.18);
		background: #fff7f7;
		color: var(--dispute);
	}
	.comment-action:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.reply-list {
		margin-top: 2px;
		padding-left: 8px;
		border-left: 2px solid rgba(16, 122, 95, 0.14);
	}
	.reply-compose {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 4px;
		padding: 10px;
		border-radius: var(--radius-sm);
		background: rgba(246, 250, 247, 0.92);
		border: 1px solid rgba(16, 122, 95, 0.16);
	}
	.reply-input {
		resize: vertical;
		min-height: 68px;
	}
	.reply-actions {
		display: flex;
		gap: 8px;
	}
	.compose-box {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px;
		background: rgba(255, 255, 255, 0.72);
		border-radius: var(--radius);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-sm);
	}
	.compose-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.compose-name {
		font-weight: 750;
		font-size: 13px;
	}
	.comment-input {
		resize: vertical;
		min-height: 92px;
		line-height: 1.5;
		background: var(--surface);
	}
	.compose-footer {
		display: flex;
		justify-content: flex-end;
	}
	.sign-in-card {
		padding: 16px;
		text-align: center;
		background: rgba(255, 255, 255, 0.72);
	}
	.link {
		color: var(--accent);
		font-weight: 600;
	}
	.empty {
		font-size: 14px;
		margin: 0;
		padding: 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: rgba(255, 255, 255, 0.72);
	}

	@media (max-width: 560px) {
		.comment {
			grid-template-columns: 30px minmax(0, 1fr);
			padding: 12px;
		}
		.comment-action {
			padding: 4px 7px;
		}
	}
</style>
