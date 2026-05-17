import { error } from '@sveltejs/kit';
import { getPostDetail, getComments, getVotePoints } from '$lib/server/posts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const post = await getPostDetail(params.id, locals.user?.id ?? null);
	if (!post) throw error(404, 'Post not found.');
	const [comments, votePoints] = await Promise.all([
		getComments(post.id, locals.user?.id ?? null),
		// Heatmap data is only meaningful for the factual-post vote flow.
		post.category === 'factual' ? getVotePoints(post.id) : Promise.resolve([])
	]);
	return { post, comments, votePoints };
};
