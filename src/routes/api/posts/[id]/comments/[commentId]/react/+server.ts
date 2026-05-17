import { json, error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { commentReactions, comments } from '$lib/server/db/schema';
import { maybeRegenerateNote } from '$lib/server/ai';
import type { CommentReactionValue } from '$lib/types';
import type { RequestHandler } from './$types';

function isMissingCommentReactionTable(err: unknown) {
	const message = err instanceof Error ? err.message : String(err);
	return message.includes('comment_reactions') && message.includes('does not exist');
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to react to comments.');

	const data = await request.json().catch(() => null);
	const reaction = String(data?.reaction ?? '') as CommentReactionValue;
	if (reaction !== 'like' && reaction !== 'dislike') throw error(400, 'Invalid comment reaction.');

	const [comment] = await db
		.select({ id: comments.id })
		.from(comments)
		.where(and(eq(comments.id, params.commentId), eq(comments.postId, params.id)));
	if (!comment) throw error(404, 'Comment not found.');

	try {
		const [existing] = await db
			.select({ id: commentReactions.id, reaction: commentReactions.reaction })
			.from(commentReactions)
			.where(
				and(
					eq(commentReactions.commentId, params.commentId),
					eq(commentReactions.userId, locals.user.id)
				)
			);

		let myReaction: CommentReactionValue | null = reaction;
		if (existing?.reaction === reaction) {
			await db.delete(commentReactions).where(eq(commentReactions.id, existing.id));
			myReaction = null;
		} else if (existing) {
			await db
				.update(commentReactions)
				.set({ reaction })
				.where(eq(commentReactions.id, existing.id));
		} else {
			await db
				.insert(commentReactions)
				.values({ commentId: params.commentId, userId: locals.user.id, reaction });
		}

		const [counts] = await db
			.select({
				likeCount: sql<number>`count(*) filter (where ${commentReactions.reaction} = 'like')::int`,
				dislikeCount: sql<number>`count(*) filter (where ${commentReactions.reaction} = 'dislike')::int`
			})
			.from(commentReactions)
			.where(eq(commentReactions.commentId, params.commentId));

		const communityNote = await maybeRegenerateNote(params.id);

		return json({
			likeCount: counts?.likeCount ?? 0,
			dislikeCount: counts?.dislikeCount ?? 0,
			myReaction,
			communityNote
		});
	} catch (err) {
		if (isMissingCommentReactionTable(err))
			throw error(500, 'Comment reactions need the latest database schema. Run npm run db:push.');
		throw err;
	}
};
