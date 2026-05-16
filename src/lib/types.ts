// Shared types — the contract between backend endpoints and the UI.

export type PostCategory = 'personal' | 'factual';
export type VoteValue = 'verify' | 'dispute';
export type MapScope = 'national' | 'local';

export interface SessionUser {
	id: string;
	email: string;
	displayName: string;
	emailVerified: boolean;
}

/** A post as shown on the map / headline list. */
export interface PostSummary {
	id: string;
	title: string;
	category: PostCategory;
	lng: number;
	lat: number;
	impactRadiusM: number;
	regionId: string;
	authorId: string;
	authorName: string;
	createdAt: string;
	commentCount: number;
	reactionCount: number;
	verifyCount: number;
	disputeCount: number;
	hasImage: boolean;
	anonymous: boolean;
	areaLabel: string;
}

export interface UserProfile {
	id: string;
	displayName: string;
	bio: string | null;
	age: number | null;
	location: string | null;
	hasAvatar: boolean;
	joinedAt: string;
	reputation: {
		score: number | null;
		label: string;
		totalVotes: number;
		postCount: number;
	};
	posts: PostSummary[];
}

export interface CommunityNote {
	body: string;
	generatedAt: string;
	basedOnCommentCount: number;
}

/** Full post for the article view. */
export interface PostDetail extends PostSummary {
	body: string;
	headerImageDataUrl: string | null;
	communityNote: CommunityNote | null;
	/** The viewer's current vote, if signed in and voted. */
	myVote: VoteValue | null;
	reactions: ReactionTally[];
	isOwn: boolean;
}

export interface ReactionTally {
	emoji: string;
	count: number;
	mine: boolean;
}

/**
 * A single vote's recorded location, for the article-view vote heatmap.
 * Deliberately carries no user identity — only where a verify/dispute vote
 * was cast — so revealing exact points can't be tied back to a person.
 */
export interface VotePoint {
	lng: number;
	lat: number;
	vote: VoteValue;
}

export interface VoteUser {
	userId: string;
	displayName: string;
	vote: VoteValue;
	createdAt: string;
}

export interface CommentItem {
	id: string;
	authorName: string;
	body: string;
	createdAt: string;
}

/** Fixed reaction set — an open emoji picker is a moderation risk (project.md §4.4). */
export const REACTIONS = ['👍', '😮', '😟', '❤️', '🔥'] as const;
