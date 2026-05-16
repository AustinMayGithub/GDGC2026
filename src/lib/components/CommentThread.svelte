<script lang="ts">
	import type { CommentItem, SessionUser } from '$lib/types';

	interface Props {
		postId: string;
		comments: CommentItem[];
		user: SessionUser | null;
	}

	let { postId, comments: initialComments, user }: Props = $props();

	let comments = $state<CommentItem[]>(initialComments);
	let body = $state('');
	let submitting = $state(false);
	let submitError = $state('');
	let reportingId = $state<string | null>(null);
	let reportReason = $state('');
	let reportError = $state('');
	let reportSubmitting = $state(false);

	function relativeTime(isoString: string): string {
		const diff = Date.now() - new Date(isoString).getTime();
		const minutes = Math.floor(diff / 60000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	async function submitComment() {
		if (!body.trim() || submitting) return;
		submitError = '';
		submitting = true;

		// Optimistic
		const optimistic: CommentItem = {
			id: `optimistic-${Date.now()}`,
			authorName: user!.displayName,
			body: body.trim(),
			createdAt: new Date().toISOString()
		};
		comments = [...comments, optimistic];
		const sentBody = body.trim();
		body = '';

		try {
			const res = await fetch(`/api/posts/${postId}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ body: sentBody })
			});
			if (res.ok) {
				const data = await res.json();
				comments = comments.map((c) => (c.id === optimistic.id ? data.comment : c));
			} else {
				const data = await res.json();
				submitError = data.message ?? 'Failed to post comment';
				comments = comments.filter((c) => c.id !== optimistic.id);
			}
		} catch {
			submitError = 'Network error';
			comments = comments.filter((c) => c.id !== optimistic.id);
		} finally {
			submitting = false;
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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			submitComment();
		}
	}
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
			{#each comments as comment (comment.id)}
				<div class="comment">
					<div class="comment-meta">
						<span class="avatar-circle">{comment.authorName[0]?.toUpperCase() ?? '?'}</span>
						<span class="author-name">{comment.authorName}</span>
						<span class="time muted">{relativeTime(comment.createdAt)}</span>
						{#if user}
							<button
								class="report-trigger muted"
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
					<p class="comment-body">{comment.body}</p>

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
				</div>
			{/each}
		</div>
	{/if}

	{#if user}
		<div class="compose-box">
			<div class="compose-header">
				<span class="avatar-circle own">{user.displayName[0]?.toUpperCase() ?? '?'}</span>
				<span class="compose-name">{user.displayName}</span>
			</div>
			<textarea
				class="input comment-input"
				placeholder="Add a comment… (Ctrl+Enter to submit)"
				bind:value={body}
				onkeydown={handleKeydown}
				rows={3}
				disabled={submitting}
			></textarea>
			{#if submitError}
				<p class="error-text">{submitError}</p>
			{/if}
			<div class="compose-footer">
				<button
					class="btn btn-primary"
					onclick={submitComment}
					disabled={submitting || !body.trim()}
				>
					{submitting ? 'Posting…' : 'Post comment'}
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
		gap: 16px;
	}
	.thread-heading {
		font-size: 14px;
		font-weight: 650;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.count-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-3);
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
		gap: 14px;
	}
	.comment {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-bottom: 14px;
		border-bottom: 1px solid var(--border);
	}
	.comment:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}
	.comment-meta {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.avatar-circle {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--gradient);
		color: #fff;
		font-size: 11px;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.avatar-circle.own {
		background: var(--gradient);
	}
	.author-name {
		font-weight: 650;
		font-size: 13px;
	}
	.time {
		font-size: 12px;
		margin-left: auto;
	}
	.report-trigger {
		border: none;
		background: none;
		padding: 0;
		font-size: 12px;
		cursor: pointer;
		margin-left: 4px;
	}
	.report-trigger:hover {
		color: var(--dispute);
	}
	.comment-body {
		margin: 0;
		font-size: 14px;
		line-height: 1.6;
		padding-left: 34px;
	}
	.report-panel {
		margin-left: 34px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		background: var(--surface-2);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
	}
	.report-input {
		resize: vertical;
	}
	.report-actions {
		display: flex;
		gap: 8px;
	}
	.compose-box {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		background: var(--surface-2);
		border-radius: var(--radius);
		border: 1px solid var(--border);
	}
	.compose-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.compose-name {
		font-weight: 650;
		font-size: 13px;
	}
	.comment-input {
		resize: vertical;
	}
	.compose-footer {
		display: flex;
		justify-content: flex-end;
	}
	.sign-in-card {
		padding: 16px;
		text-align: center;
	}
	.link {
		color: var(--accent);
		font-weight: 600;
	}
	.empty {
		font-size: 14px;
		margin: 0;
	}
</style>
