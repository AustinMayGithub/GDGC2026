import { and, eq } from 'drizzle-orm';
import { getComments, getPostDetail, getVotePoints, getVoteUsers } from '$lib/server/posts';
import { db } from '$lib/server/db';
import { posts } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const post = await getPostDetail(params.id, locals.user?.id ?? null);
	if (!post) throw error(404);

	const [comments, votePoints, voteUsers] = await Promise.all([
		getComments(params.id, locals.user?.id ?? null),
		post.category === 'news' ? getVotePoints(params.id) : Promise.resolve([]),
		post.category === 'news' ? getVoteUsers(params.id) : Promise.resolve([])
	]);
	return json({ post, comments, votePoints, voteUsers });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to delete this post.');

	const [deleted] = await db
		.delete(posts)
		.where(and(eq(posts.id, params.id), eq(posts.authorId, locals.user.id)))
		.returning({ id: posts.id });

	if (!deleted) throw error(404, 'Post not found.');
	return json({ ok: true });
};
