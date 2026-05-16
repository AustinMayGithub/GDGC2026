import { db } from '$lib/server/db';
import { posts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401);

	const [post] = await db
		.select({ authorId: posts.authorId })
		.from(posts)
		.where(eq(posts.id, params.id));

	if (!post) throw error(404);
	if (post.authorId !== locals.user.id) throw error(403);

	await db.delete(posts).where(eq(posts.id, params.id));

	return new Response(null, { status: 204 });
};
