import { getComments, getPostDetail, getVotePoints, getVoteUsers } from '$lib/server/posts';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const post = await getPostDetail(params.id, locals.user?.id ?? null);
	if (!post) throw error(404);

	const [comments, votePoints, voteUsers] = await Promise.all([
		getComments(params.id),
		post.category === 'factual' ? getVotePoints(params.id) : Promise.resolve([]),
		post.category === 'factual' ? getVoteUsers(params.id) : Promise.resolve([])
	]);
	return json({ post, comments, votePoints, voteUsers });
};
