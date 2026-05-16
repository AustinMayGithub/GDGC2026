import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { commentNotifications, comments, posts, users } from './db/schema';
import type { CommentNotification } from '$lib/types';

const iso = (d: Date) => d.toISOString();

function isMissingNotificationTable(err: unknown) {
	const message = err instanceof Error ? err.message : String(err);
	return message.includes('comment_notifications') && message.includes('does not exist');
}

export async function hasUnreadCommentNotifications(userId: string): Promise<boolean> {
	try {
		const rows = await db
			.select({ id: commentNotifications.id })
			.from(commentNotifications)
			.where(and(eq(commentNotifications.recipientId, userId), isNull(commentNotifications.readAt)))
			.limit(1);
		return rows.length > 0;
	} catch (err) {
		if (isMissingNotificationTable(err)) return false;
		throw err;
	}
}

export async function getUnreadCommentNotifications(userId: string): Promise<CommentNotification[]> {
	try {
		const rows = await db
			.select({
				id: commentNotifications.id,
				postId: commentNotifications.postId,
				postTitle: posts.title,
				commentId: commentNotifications.commentId,
				authorName: users.displayName,
				body: comments.body,
				createdAt: comments.createdAt
			})
			.from(commentNotifications)
			.innerJoin(comments, eq(commentNotifications.commentId, comments.id))
			.innerJoin(posts, eq(commentNotifications.postId, posts.id))
			.innerJoin(users, eq(comments.authorId, users.id))
			.where(and(eq(commentNotifications.recipientId, userId), isNull(commentNotifications.readAt)))
			.orderBy(desc(commentNotifications.createdAt))
			.limit(20);

		return rows.map((row) => ({
			id: row.id,
			postId: row.postId,
			postTitle: row.postTitle,
			commentId: row.commentId,
			authorName: row.authorName,
			body: row.body,
			createdAt: iso(row.createdAt)
		}));
	} catch (err) {
		if (isMissingNotificationTable(err)) return [];
		throw err;
	}
}

export async function markCommentNotificationsRead(userId: string) {
	try {
		await db
			.update(commentNotifications)
			.set({ readAt: sql`now()` })
			.where(and(eq(commentNotifications.recipientId, userId), isNull(commentNotifications.readAt)));
	} catch (err) {
		if (isMissingNotificationTable(err)) return;
		throw err;
	}
}

export async function notifyPreviousCommenters(postId: string, commentId: string, authorId: string) {
	try {
		await db.execute(sql`
			insert into comment_notifications (recipient_id, post_id, comment_id)
			select distinct ${comments.authorId}, ${comments.postId}, ${commentId}
			from ${comments}
			where ${comments.postId} = ${postId}
				and ${comments.authorId} <> ${authorId}
				and ${comments.id} <> ${commentId}
			on conflict on constraint uniq_comment_notification do nothing
		`);
	} catch (err) {
		if (isMissingNotificationTable(err)) return;
		throw err;
	}
}
