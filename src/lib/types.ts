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
	authorName: string;
	createdAt: string;
	commentCount: number;
	reactionCount: number;
	verifyCount: number;
	disputeCount: number;
}

export interface CommunityNote {
	body: string;
	generatedAt: string;
	basedOnCommentCount: number;
}

/** Full post for the article view. */
export interface PostDetail extends PostSummary {
	body: string;
	photoUrls: string[];
	communityNote: CommunityNote | null;
	/** The viewer's current vote, if signed in and voted. */
	myVote: VoteValue | null;
	reactions: ReactionTally[];
}

export interface ReactionTally {
	emoji: string;
	count: number;
	mine: boolean;
}

export interface CommentItem {
	id: string;
	authorName: string;
	body: string;
	createdAt: string;
}

/** Fixed reaction set — an open emoji picker is a moderation risk (project.md §4.4). */
export const REACTIONS = ['👍', '😮', '😟', '❤️', '🔥'] as const;
