import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { posts, users, postVotes, comments, communityNotes, reactions } from './db/schema';
import { getPostHeaderImageUrl } from './uploads';
import type {
	PostSummary,
	PostDetail,
	CommentItem,
	VoteValue,
	ReactionTally
} from '$lib/types';

const iso = (d: Date) => d.toISOString();

export async function listPosts(opts: { regionId?: string } = {}): Promise<PostSummary[]> {
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
			authorName: users.displayName
		})
		.from(posts)
		.innerJoin(users, eq(posts.authorId, users.id))
		.where(opts.regionId ? eq(posts.regionId, opts.regionId) : undefined)
		.orderBy(desc(posts.createdAt))
		.limit(300);

	const [voteRows, commentRows, reactionRows] = await Promise.all([
		db
			.select({ postId: postVotes.postId, vote: postVotes.vote, c: sql<number>`count(*)::int` })
			.from(postVotes)
			.groupBy(postVotes.postId, postVotes.vote),
		db
			.select({ postId: comments.postId, c: sql<number>`count(*)::int` })
			.from(comments)
			.groupBy(comments.postId),
		db
			.select({ postId: reactions.postId, c: sql<number>`count(*)::int` })
			.from(reactions)
			.groupBy(reactions.postId)
	]);

	const verify = new Map<string, number>();
	const dispute = new Map<string, number>();
	const cmt = new Map<string, number>();
	const reactionCount = new Map<string, number>();
	for (const v of voteRows) (v.vote === 'verify' ? verify : dispute).set(v.postId, v.c);
	for (const c of commentRows) cmt.set(c.postId, c.c);
	for (const r of reactionRows) reactionCount.set(r.postId, r.c);

	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		category: r.category,
		lng: r.lng,
		lat: r.lat,
		impactRadiusM: r.impactRadiusM,
		regionId: r.regionId,
		authorName: r.authorName,
		createdAt: iso(r.createdAt),
		commentCount: cmt.get(r.id) ?? 0,
		reactionCount: reactionCount.get(r.id) ?? 0,
		verifyCount: verify.get(r.id) ?? 0,
		disputeCount: dispute.get(r.id) ?? 0
	}));
}

export async function getPostDetail(
	id: string,
	viewerId: string | null
): Promise<PostDetail | null> {
	const [r] = await db
		.select({
			id: posts.id,
			title: posts.title,
			body: posts.body,
			category: posts.category,
			lng: posts.lng,
			lat: posts.lat,
			impactRadiusM: posts.impactRadiusM,
			regionId: posts.regionId,
			createdAt: posts.createdAt,
			authorName: users.displayName
		})
		.from(posts)
		.innerJoin(users, eq(posts.authorId, users.id))
		.where(eq(posts.id, id));
	if (!r) return null;

	const [voteRows, commentCountRows, noteRows, reactionRows, myVoteRows, headerImageUrl] = await Promise.all([
		db
			.select({ vote: postVotes.vote, c: sql<number>`count(*)::int` })
			.from(postVotes)
			.where(eq(postVotes.postId, id))
			.groupBy(postVotes.vote),
		db
			.select({ c: sql<number>`count(*)::int` })
			.from(comments)
			.where(eq(comments.postId, id)),
		db.select().from(communityNotes).where(eq(communityNotes.postId, id)),
		db
			.select({ emoji: reactions.emoji, userId: reactions.userId })
			.from(reactions)
			.where(eq(reactions.postId, id)),
		viewerId
			? db
					.select({ vote: postVotes.vote })
					.from(postVotes)
					.where(and(eq(postVotes.postId, id), eq(postVotes.userId, viewerId)))
			: Promise.resolve([] as { vote: VoteValue }[]),
		getPostHeaderImageUrl(id)
	]);

	let verifyCount = 0;
	let disputeCount = 0;
	for (const v of voteRows) {
		if (v.vote === 'verify') verifyCount = v.c;
		else disputeCount = v.c;
	}

	const reactionMap = new Map<string, { count: number; mine: boolean }>();
	for (const x of reactionRows) {
		const e = reactionMap.get(x.emoji) ?? { count: 0, mine: false };
		e.count++;
		if (x.userId === viewerId) e.mine = true;
		reactionMap.set(x.emoji, e);
	}
	const reactionTally: ReactionTally[] = [...reactionMap.entries()].map(([emoji, v]) => ({
		emoji,
		count: v.count,
		mine: v.mine
	}));

	const note = noteRows[0];
	return {
		id: r.id,
		title: r.title,
		body: r.body,
		headerImageUrl,
		category: r.category,
		lng: r.lng,
		lat: r.lat,
		impactRadiusM: r.impactRadiusM,
		regionId: r.regionId,
		authorName: r.authorName,
		createdAt: iso(r.createdAt),
		commentCount: commentCountRows[0]?.c ?? 0,
		reactionCount: reactionRows.length,
		verifyCount,
		disputeCount,
		communityNote: note
			? {
					body: note.body,
					generatedAt: iso(note.generatedAt),
					basedOnCommentCount: note.basedOnCommentCount
				}
			: null,
		myVote: (myVoteRows[0]?.vote as VoteValue) ?? null,
		reactions: reactionTally
	};
}

export async function getComments(postId: string): Promise<CommentItem[]> {
	const rows = await db
		.select({
			id: comments.id,
			body: comments.body,
			createdAt: comments.createdAt,
			authorName: users.displayName
		})
		.from(comments)
		.innerJoin(users, eq(comments.authorId, users.id))
		.where(eq(comments.postId, postId))
		.orderBy(comments.createdAt);
	return rows.map((r) => ({
		id: r.id,
		authorName: r.authorName,
		body: r.body,
		createdAt: iso(r.createdAt)
	}));
}
