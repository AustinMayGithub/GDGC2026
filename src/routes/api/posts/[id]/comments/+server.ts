import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts, comments } from '$lib/server/db/schema';
import { getComments } from '$lib/server/posts';
import { moderateText, maybeRegenerateNote } from '$lib/server/ai';
import { notifyPreviousCommenters } from '$lib/server/notifications';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	return json({ comments: await getComments(params.id) });
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to comment.');

	const data = await request.json().catch(() => null);
	const body = String(data?.body ?? '').trim();
	if (body.length < 1 || body.length > 2000)
		throw error(400, 'Comment must be 1–2000 characters.');

	const [post] = await db
		.select({ id: posts.id })
		.from(posts)
		.where(eq(posts.id, params.id));
	if (!post) throw error(404, 'Post not found.');

	const allowed = await moderateText(body);
	if (!allowed) throw error(422, 'This comment was flagged by moderation.');

	const [c] = await db
		.insert(comments)
		.values({ postId: params.id, authorId: locals.user.id, body })
		.returning();

	await notifyPreviousCommenters(params.id, c.id, locals.user.id);

	const communityNote = await maybeRegenerateNote(params.id);

	return json(
		{
			comment: {
				id: c.id,
				authorName: locals.user.displayName,
				body: c.body,
				createdAt: c.createdAt.toISOString()
			},
			communityNote
		},
		{ status: 201 }
	);
};
