<script lang="ts">
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
	let reportingId = $state<string | null>(null);
	let reportReason = $state('');
	let reportError = $state('');
	let reportSubmitting = $state(false);
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

		try {
			const res = await fetch(`/api/posts/${postId}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ body: sentBody, parentId })
			});
			const data = await res.json().catch(() => ({}));
			if (res.ok) {
				comments = comments.map((comment) =>
					comment.id === optimistic.id ? data.comment : comment
				);
				replyingToId = null;
				if (data.communityNote) onCommunityNoteUpdated(data.communityNote);
			} else {
				submitError = data.message ?? 'Failed to post comment';
				comments = comments.filter((comment) => comment.id !== optimistic.id);
			}
		} catch {
			submitError = 'Network error';
			comments = comments.filter((comment) => comment.id !== optimistic.id);
		} finally {
			submitting = false;
			submittingReplyId = null;
		}
	}

	async function reactToComment(comment: CommentItem, reaction: CommentReactionValue) {
		if (!user || reactingIds.has(comment.id)) return;
		reactingIds = new Set([...reactingIds, comment.id]);
		submitError = '';

		try {
			const res = await fetch(`/api/posts/${postId}/comments/${comment.id}/react`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reaction })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				submitError = data.message ?? 'Failed to update comment reaction';
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
		} finally {
			const next = new Set(reactingIds);
			next.delete(comment.id);
			reactingIds = next;
		}
	}

	async function submitReport(commentId: string) {
		if (!reportReason.trim() || reportSubmitting) return;
		reportError = '';
		reportSubmitting = true;
		try {
			const res = await fetch(`/api/posts/${postId}/report`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ targetType: 'comment', targetId: commentId, reason: reportReason.trim() })
			});
			if (res.ok) {
				reportingId = null;
				reportReason = '';
			} else {
				const data = await res.json();
				reportError = data.message ?? 'Report failed';
			}
		} catch {
			reportError = 'Network error';
		} finally {
			reportSubmitting = false;
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

	$effect(() => {
		postId;
		comments = [...initialComments];
		replyingToId = null;
		replyDrafts = {};
		submitError = '';
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
								<button
									class="comment-action danger"
									onclick={() => {
										reportingId = reportingId === comment.id ? null : comment.id;
										reportReason = '';
										reportError = '';
									}}
								>
									Report
								</button>
							{/if}
						</div>

						{#if reportingId === comment.id}
							<div class="report-panel">
								<textarea
									class="input report-input"
									placeholder="Why are you reporting this comment?"
									bind:value={reportReason}
									rows={2}
								></textarea>
								{#if reportError}
									<p class="error-text">{reportError}</p>
								{/if}
								<div class="report-actions">
									<button
										class="btn btn-primary"
										onclick={() => submitReport(comment.id)}
										disabled={reportSubmitting || !reportReason.trim()}
									>
										Submit
									</button>
									<button class="btn" onclick={() => { reportingId = null; reportReason = ''; }}>
										Cancel
									</button>
								</div>
							</div>
						{/if}

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
												{#if user}
													<button
														class="comment-action danger"
														onclick={() => {
															reportingId = reportingId === reply.id ? null : reply.id;
															reportReason = '';
															reportError = '';
														}}
													>
														Report
													</button>
												{/if}
											</div>

											{#if reportingId === reply.id}
												<div class="report-panel">
													<textarea
														class="input report-input"
														placeholder="Why are you reporting this reply?"
														bind:value={reportReason}
														rows={2}
													></textarea>
													{#if reportError}
														<p class="error-text">{reportError}</p>
													{/if}
													<div class="report-actions">
														<button
															class="btn btn-primary"
															onclick={() => submitReport(reply.id)}
															disabled={reportSubmitting || !reportReason.trim()}
														>
															Submit
														</button>
														<button class="btn" onclick={() => { reportingId = null; reportReason = ''; }}>
															Cancel
														</button>
													</div>
												</div>
											{/if}
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
		border-radius: 999px;
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
	.reply-compose,
	.report-panel {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 4px;
		padding: 10px;
		border-radius: var(--radius-sm);
	}
	.reply-compose {
		background: rgba(246, 250, 247, 0.92);
		border: 1px solid rgba(16, 122, 95, 0.16);
	}
	.report-panel {
		background: #fffafa;
		border: 1px solid rgba(220, 38, 38, 0.18);
	}
	.reply-input,
	.report-input {
		resize: vertical;
		min-height: 68px;
	}
	.reply-actions,
	.report-actions {
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
