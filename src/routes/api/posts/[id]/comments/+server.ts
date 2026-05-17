import { json, error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts, comments } from '$lib/server/db/schema';
import { getComments } from '$lib/server/posts';
import { moderateText, maybeRegenerateNote } from '$lib/server/ai';
import { notifyPreviousCommenters } from '$lib/server/notifications';
import type { RequestHandler } from './$types';

function isMissingCommentParentColumn(err: unknown) {
	const message = err instanceof Error ? err.message : String(err);
	return message.includes('parent_id') && message.includes('does not exist');
}

export const GET: RequestHandler = async ({ params, locals }) => {
	return json({ comments: await getComments(params.id, locals.user?.id ?? null) });
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to comment.');

	const data = await request.json().catch(() => null);
	const body = String(data?.body ?? '').trim();
	if (body.length < 1 || body.length > 2000)
		throw error(400, 'Comment must be 1-2000 characters.');
	const requestedParentId = typeof data?.parentId === 'string' ? data.parentId : null;

	const [post] = await db
		.select({ id: posts.id })
		.from(posts)
		.where(eq(posts.id, params.id));
	if (!post) throw error(404, 'Post not found.');

	const allowed = await moderateText(body);
	if (!allowed) throw error(422, 'This comment was flagged by moderation.');

	let parentId: string | null = null;
	if (requestedParentId) {
		try {
			const [parent] = await db
				.select({ id: comments.id, parentId: comments.parentId })
				.from(comments)
				.where(and(eq(comments.id, requestedParentId), eq(comments.postId, params.id)));
			if (!parent) throw error(404, 'Comment not found.');
			parentId = parent.parentId ?? parent.id;
		} catch (err) {
			if (isMissingCommentParentColumn(err))
				throw error(500, 'Comment replies need the latest database schema. Run npm run db:push.');
			throw err;
		}
	}

	let c: typeof comments.$inferSelect;
	try {
		[c] = await db
			.insert(comments)
			.values({ postId: params.id, authorId: locals.user.id, body, parentId })
			.returning();
	} catch (err) {
		if (isMissingCommentParentColumn(err))
			throw error(500, 'Comment replies need the latest database schema. Run npm run db:push.');
		throw err;
	}

	await notifyPreviousCommenters(params.id, c.id, locals.user.id);

	const communityNote = await maybeRegenerateNote(params.id);

	return json(
		{
			comment: {
				id: c.id,
				parentId,
				authorId: locals.user.id,
				authorName: locals.user.displayName,
				authorHasAvatar: locals.user.hasAvatar,
				body: c.body,
				createdAt: c.createdAt.toISOString(),
				likeCount: 0,
				dislikeCount: 0,
				myReaction: null
			},
			communityNote
		},
		{ status: 201 }
	);
};
