import { json, error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { comments } from '$lib/server/db/schema';
import { maybeRegenerateNote } from '$lib/server/ai';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to delete comments.');

	const [comment] = await db
		.select({ id: comments.id, authorId: comments.authorId })
		.from(comments)
		.where(and(eq(comments.id, params.commentId), eq(comments.postId, params.id)));

	if (!comment) throw error(404, 'Comment not found.');
	if (comment.authorId !== locals.user.id)
		throw error(403, 'You can only delete your own comments.');

	// Replies and reactions are removed by the ON DELETE CASCADE on the schema.
	await db.delete(comments).where(eq(comments.id, params.commentId));

	const communityNote = await maybeRegenerateNote(params.id);

	return json({ ok: true, communityNote });
};
