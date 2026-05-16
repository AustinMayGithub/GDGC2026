import { getComments, getPostDetail } from '$lib/server/posts';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const post = await getPostDetail(params.id, locals.user?.id ?? null);
	if (!post) throw error(404);

	const comments = await getComments(params.id);
	return json({ post, comments });
};
