import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from './db';
import { posts, users, postVotes, comments, communityNotes, reactions } from './db/schema';
import { getRegion } from '$lib/data/nz-regions';
import { fallbackAreaLabel, nearestPlace } from '$lib/data/geo-labels';
import { generateAreaLabel } from './ai';
import type {
	PostSummary,
	PostDetail,
	CommentItem,
	VoteValue,
	ReactionTally,
	VotePoint,
	VoteUser
} from '$lib/types';

const iso = (d: Date) => d.toISOString();

type PostListRow = {
	id: string;
	title: string;
	category: PostSummary['category'];
	lng: number;
	lat: number;
	impactRadiusM: number;
	regionId: string;
	createdAt: Date;
	authorId: string;
	authorName: string;
	anonymous: boolean;
	hasImage: boolean;
};

type PostDetailRow = {
	id: string;
	title: string;
	body: string;
	headerImageDataUrl: string | null;
	category: PostDetail['category'];
	lng: number;
	lat: number;
	impactRadiusM: number;
	regionId: string;
	createdAt: Date;
	authorId: string;
	authorName: string;
	anonymous: boolean;
};

function isMissingOptionalPostColumn(err: unknown) {
	const message = err instanceof Error ? err.message : String(err);
	return (
		(message.includes('anonymous') || message.includes('header_image_data_url')) &&
		message.includes('does not exist')
	);
}

async function selectPostListRows(opts: { regionId?: string }): Promise<PostListRow[]> {
	try {
		return await db
			.select({
				id: posts.id,
				title: posts.title,
				category: posts.category,
				lng: posts.lng,
				lat: posts.lat,
				impactRadiusM: posts.impactRadiusM,
				regionId: posts.regionId,
				createdAt: posts.createdAt,
				authorId: posts.authorId,
				authorName: users.displayName,
				anonymous: posts.anonymous,
				hasImage: sql<boolean>`(${posts.headerImageDataUrl} IS NOT NULL)`
			})
			.from(posts)
			.innerJoin(users, eq(posts.authorId, users.id))
			.where(opts.regionId ? eq(posts.regionId, opts.regionId) : undefined)
			.orderBy(desc(posts.createdAt))
			.limit(300);
	} catch (err) {
		if (!isMissingOptionalPostColumn(err)) throw err;

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
				authorId: posts.authorId,
				authorName: users.displayName
			})
			.from(posts)
			.innerJoin(users, eq(posts.authorId, users.id))
			.where(opts.regionId ? eq(posts.regionId, opts.regionId) : undefined)
			.orderBy(desc(posts.createdAt))
			.limit(300);

		return rows.map((row) => ({
			...row,
			anonymous: false,
			hasImage: false
		}));
	}
}

async function selectPostDetailRow(id: string): Promise<PostDetailRow | null> {
	try {
		const [row] = await db
			.select({
				id: posts.id,
				title: posts.title,
				body: posts.body,
				headerImageDataUrl: posts.headerImageDataUrl,
				category: posts.category,
				lng: posts.lng,
				lat: posts.lat,
				impactRadiusM: posts.impactRadiusM,
				regionId: posts.regionId,
				createdAt: posts.createdAt,
				authorId: posts.authorId,
				authorName: users.displayName,
				anonymous: posts.anonymous
			})
			.from(posts)
			.innerJoin(users, eq(posts.authorId, users.id))
			.where(eq(posts.id, id));

		return row ?? null;
	} catch (err) {
		if (!isMissingOptionalPostColumn(err)) throw err;

		const [row] = await db
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
				authorId: posts.authorId,
				authorName: users.displayName
			})
			.from(posts)
			.innerJoin(users, eq(posts.authorId, users.id))
			.where(eq(posts.id, id));

		return row
			? {
					...row,
					headerImageDataUrl: null,
					anonymous: false
				}
			: null;
	}
}

export async function listPosts(opts: { regionId?: string } = {}): Promise<PostSummary[]> {
	const rows = await selectPostListRows(opts);

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
		createdAt: iso(r.createdAt),
		commentCount: cmt.get(r.id) ?? 0,
		reactionCount: reactionCount.get(r.id) ?? 0,
		verifyCount: verify.get(r.id) ?? 0,
		disputeCount: dispute.get(r.id) ?? 0,
		hasImage: Boolean(r.hasImage),
		anonymous: r.anonymous,
		areaLabel: fallbackAreaLabel(r.lng, r.lat, r.impactRadiusM),
		authorId: r.anonymous ? '' : r.authorId,
		authorName: r.anonymous ? 'Anonymous' : r.authorName
	}));
}

export async function getPostDetail(
	id: string,
	viewerId: string | null
): Promise<PostDetail | null> {
	const r = await selectPostDetailRow(id);
	if (!r) return null;

	const [voteRows, commentCountRows, noteRows, reactionRows, myVoteRows] = await Promise.all([
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
			: Promise.resolve([] as { vote: VoteValue }[])
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
	const place = nearestPlace(r.lng, r.lat);
	const region = getRegion(r.regionId);
	const areaLabel = await generateAreaLabel({
		lng: r.lng,
		lat: r.lat,
		radiusM: r.impactRadiusM,
		regionName: region?.name ?? 'New Zealand',
		nearestPlace: place?.name ?? region?.name ?? 'this area'
	});

	return {
		id: r.id,
		title: r.title,
		body: r.body,
		headerImageDataUrl: r.headerImageDataUrl,
		category: r.category,
		lng: r.lng,
		lat: r.lat,
		impactRadiusM: r.impactRadiusM,
		regionId: r.regionId,
		anonymous: r.anonymous,
		authorId: r.anonymous && viewerId !== r.authorId ? '' : r.authorId,
		authorName: r.anonymous ? 'Anonymous' : r.authorName,
		isOwn: viewerId !== null && viewerId === r.authorId,
		createdAt: iso(r.createdAt),
		commentCount: commentCountRows[0]?.c ?? 0,
		reactionCount: reactionRows.length,
		verifyCount,
		disputeCount,
		areaLabel,
		communityNote: note
			? {
					body: note.body,
					generatedAt: iso(note.generatedAt),
					basedOnCommentCount: note.basedOnCommentCount
				}
			: null,
		hasImage: r.headerImageDataUrl !== null,
		myVote: (myVoteRows[0]?.vote as VoteValue) ?? null,
		reactions: reactionTally
	};
}

/**
 * Located votes for a post, for the article-view heatmap. Only votes that
 * recorded a voter location are returned, and no user identity is attached —
 * the heatmap shows where votes came from, never who cast them.
 */
export async function getVotePoints(postId: string): Promise<VotePoint[]> {
	const rows = await db
		.select({
			vote: postVotes.vote,
			lng: postVotes.voterLng,
			lat: postVotes.voterLat
		})
		.from(postVotes)
		.where(
			and(
				eq(postVotes.postId, postId),
				isNotNull(postVotes.voterLng),
				isNotNull(postVotes.voterLat)
			)
		);

	return rows
		.filter((r) => r.lng !== null && r.lat !== null)
		.map((r) => ({ vote: r.vote, lng: r.lng as number, lat: r.lat as number }));
}

export async function getVoteUsers(postId: string): Promise<VoteUser[]> {
	const rows = await db
		.select({
			userId: users.id,
			displayName: users.displayName,
			vote: postVotes.vote,
			createdAt: postVotes.createdAt
		})
		.from(postVotes)
		.innerJoin(users, eq(postVotes.userId, users.id))
		.where(eq(postVotes.postId, postId))
		.orderBy(desc(postVotes.createdAt));

	return rows.map((r) => ({
		userId: r.userId,
		displayName: r.displayName,
		vote: r.vote,
		createdAt: iso(r.createdAt)
	}));
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
