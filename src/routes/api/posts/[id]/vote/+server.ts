import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts, postVotes } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	// Voting is gated to email-verified accounts, server-side (project.md §4.4).
	if (!locals.user) throw error(401, 'Sign in to vote.');
	if (!locals.user.emailVerified) throw error(403, 'Verify your email to vote.');

	const data = await request.json().catch(() => null);
	const vote = data?.vote;
	if (vote !== 'verify' && vote !== 'dispute') throw error(400, 'Invalid vote.');

	const [post] = await db
		.select({ category: posts.category })
		.from(posts)
		.where(eq(posts.id, params.id));
	if (!post) throw error(404, 'Post not found.');
	if (post.category !== 'factual')
		throw error(400, 'Only factual posts can be voted on.');

	const voterLng = Number.isFinite(Number(data?.voterLng)) ? Number(data.voterLng) : null;
	const voterLat = Number.isFinite(Number(data?.voterLat)) ? Number(data.voterLat) : null;

	await db
		.insert(postVotes)
		.values({ postId: params.id, userId: locals.user.id, vote, voterLng, voterLat })
		.onConflictDoUpdate({
			target: [postVotes.postId, postVotes.userId],
			set: { vote, voterLng, voterLat, createdAt: new Date() }
		});

	const rows = await db
		.select({ vote: postVotes.vote, c: sql<number>`count(*)::int` })
		.from(postVotes)
		.where(eq(postVotes.postId, params.id))
		.groupBy(postVotes.vote);

	let verifyCount = 0;
	let disputeCount = 0;
	for (const r of rows) {
		if (r.vote === 'verify') verifyCount = r.c;
		else disputeCount = r.c;
	}
	return json({ verifyCount, disputeCount, myVote: vote });
};
