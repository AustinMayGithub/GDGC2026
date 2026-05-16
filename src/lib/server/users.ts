import { desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { posts, users, postVotes, comments, reactions } from './db/schema';
import type { PostSummary, UserProfile } from '$lib/types';

const iso = (d: Date) => d.toISOString();

export async function getUserProfile(id: string): Promise<UserProfile | null> {
	const [u] = await db
		.select({
			id: users.id,
			displayName: users.displayName,
			bio: users.bio,
			age: users.age,
			location: users.location,
			hasAvatar: sql<boolean>`(${users.avatarDataUrl} IS NOT NULL)`,
			createdAt: users.createdAt
		})
		.from(users)
		.where(eq(users.id, id));

	if (!u) return null;

	const rows = await db
		.select({
			id: posts.id,
			title: posts.title,
			category: posts.category,
			lng: posts.lng,
			lat: posts.lat,
			impactRadiusM: posts.impactRadiusM,
			regionId: posts.regionId,
			createdAt: posts.createdAt,
			anonymous: posts.anonymous,
			hasImage: sql<boolean>`(${posts.headerImageDataUrl} IS NOT NULL)`
		})
		.from(posts)
		.where(eq(posts.authorId, id))
		.orderBy(desc(posts.createdAt));

	const [voteRows, commentRows, reactionRows] = await Promise.all([
		db
			.select({ postId: postVotes.postId, vote: postVotes.vote, c: sql<number>`count(*)::int` })
			.from(postVotes)
			.innerJoin(posts, eq(postVotes.postId, posts.id))
			.where(eq(posts.authorId, id))
			.groupBy(postVotes.postId, postVotes.vote),
		db
			.select({ postId: comments.postId, c: sql<number>`count(*)::int` })
			.from(comments)
			.innerJoin(posts, eq(comments.postId, posts.id))
			.where(eq(posts.authorId, id))
			.groupBy(comments.postId),
		db
			.select({ postId: reactions.postId, c: sql<number>`count(*)::int` })
			.from(reactions)
			.innerJoin(posts, eq(reactions.postId, posts.id))
			.where(eq(posts.authorId, id))
			.groupBy(reactions.postId)
	]);

	const verify = new Map<string, number>();
	const dispute = new Map<string, number>();
	const cmt = new Map<string, number>();
	const reactionCount = new Map<string, number>();
	for (const v of voteRows) (v.vote === 'verify' ? verify : dispute).set(v.postId, v.c);
	for (const c of commentRows) cmt.set(c.postId, c.c);
	for (const r of reactionRows) reactionCount.set(r.postId, r.c);

	const userPosts: PostSummary[] = rows.map((r) => ({
		id: r.id,
		title: r.title,
		category: r.category,
		lng: r.lng,
		lat: r.lat,
		impactRadiusM: r.impactRadiusM,
		regionId: r.regionId,
		authorId: id,
		authorName: u.displayName,
		createdAt: iso(r.createdAt),
		commentCount: cmt.get(r.id) ?? 0,
		reactionCount: reactionCount.get(r.id) ?? 0,
		verifyCount: verify.get(r.id) ?? 0,
		disputeCount: dispute.get(r.id) ?? 0,
		hasImage: Boolean(r.hasImage),
		anonymous: r.anonymous
	}));

	const totalVerify = userPosts.reduce((sum, p) => sum + p.verifyCount, 0);
	const totalDispute = userPosts.reduce((sum, p) => sum + p.disputeCount, 0);
	const totalVotes = totalVerify + totalDispute;

	let score: number | null = null;
	let label = 'Unrated';
	if (totalVotes >= 5) {
		score = Math.round((totalVerify / totalVotes) * 100);
		if (score >= 80) label = 'Highly Trusted';
		else if (score >= 60) label = 'Trusted';
		else if (score >= 40) label = 'Balanced';
		else label = 'Disputed';
	}

	return {
		id: u.id,
		displayName: u.displayName,
		bio: u.bio,
		age: u.age,
		location: u.location,
		hasAvatar: Boolean(u.hasAvatar),
		joinedAt: iso(u.createdAt),
		reputation: { score, label, totalVotes, postCount: rows.length },
		posts: userPosts
	};
}

export async function updateUserProfile(
	id: string,
	data: {
		displayName?: string;
		bio?: string | null;
		age?: number | null;
		location?: string | null;
		avatarDataUrl?: string | null;
	}
) {
	await db.update(users).set(data).where(eq(users.id, id));
}
