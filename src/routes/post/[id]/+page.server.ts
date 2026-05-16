import { error } from '@sveltejs/kit';
import { getPostDetail, getComments } from '$lib/server/posts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const post = await getPostDetail(params.id, locals.user?.id ?? null);
	if (!post) throw error(404, 'Post not found.');
	const comments = await getComments(post.id);
	return { post, comments };
};
