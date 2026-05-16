import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts, postVotes } from '$lib/server/db/schema';
import { getVotePoints, getVoteUsers } from '$lib/server/posts';
import { haversineMeters, isWithinRadius, formatDistance } from '$lib/geo';
import type { RequestHandler } from './$types';

/** Parse a coordinate from the request body; null if absent or not finite. */
function coord(value: unknown): number | null {
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
	// Voting is gated to email-verified accounts, server-side (project.md §4.4).
	if (!locals.user) throw error(401, 'Sign in to vote.');
	if (!locals.user.emailVerified) throw error(403, 'Verify your email to vote.');

	const data = await request.json().catch(() => null);
	const vote = data?.vote;
	if (vote !== 'verify' && vote !== 'dispute') throw error(400, 'Invalid vote.');

	const [post] = await db
		.select({
			category: posts.category,
			lng: posts.lng,
			lat: posts.lat,
			impactRadiusM: posts.impactRadiusM
		})
		.from(posts)
		.where(eq(posts.id, params.id));
	if (!post) throw error(404, 'Post not found.');
	if (post.category !== 'factual')
		throw error(400, 'Only factual posts can be voted on.');

	// Location gate: a voter must be inside the post's impact zone to vote
	// (the heatmap depends on this, and it raises the bar for brigading).
	const voterLng = coord(data?.voterLng);
	const voterLat = coord(data?.voterLat);
	if (voterLng === null || voterLat === null)
		throw error(400, 'Location required — share your location to vote on this post.');

	const accuracyM = coord(data?.accuracyM) ?? 0;
	if (!isWithinRadius(post.lng, post.lat, post.impactRadiusM, voterLng, voterLat, accuracyM)) {
		const distance = haversineMeters(post.lng, post.lat, voterLng, voterLat);
		throw error(
			403,
			`You're ${formatDistance(distance)} from this story — you must be inside its ` +
				`${formatDistance(post.impactRadiusM)} impact zone to vote.`
		);
	}

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

	// Return refreshed heatmap points so the article view can update live.
	const [points, voters] = await Promise.all([getVotePoints(params.id), getVoteUsers(params.id)]);
	return json({ verifyCount, disputeCount, myVote: vote, points, voters });
};
