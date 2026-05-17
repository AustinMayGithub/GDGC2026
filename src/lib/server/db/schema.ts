import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	doublePrecision,
	timestamp,
	unique,
	index
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export const postCategory = pgEnum('post_category', ['community', 'news']);
export const voteValue = pgEnum('vote_value', ['verify', 'dispute']);
export const otpPurpose = pgEnum('otp_purpose', ['signup', 'login']);

export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	displayName: text('display_name').notNull(),
	emailVerified: boolean('email_verified').notNull().default(false),
	loginOtpEnabled: boolean('login_otp_enabled').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	avatarDataUrl: text('avatar_data_url'),
	bio: text('bio'),
	age: integer('age'),
	location: text('location')
});

export const sessions = pgTable('sessions', {
	id: text('id').primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

export const emailOtps = pgTable(
	'email_otps',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		codeHash: text('code_hash').notNull(),
		purpose: otpPurpose('purpose').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		used: boolean('used').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		lookup: index('otp_lookup').on(t.userId, t.purpose, t.used, t.expiresAt)
	})
);

export const posts = pgTable(
	'posts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		authorId: uuid('author_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		body: text('body').notNull(),
		headerImageDataUrl: text('header_image_data_url'),
		category: postCategory('category').notNull(),
		lng: doublePrecision('lng').notNull(),
		lat: doublePrecision('lat').notNull(),
		impactRadiusM: integer('impact_radius_m').notNull(),
		regionId: text('region_id').notNull(),
		anonymous: boolean('anonymous').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		byRegion: index('posts_region').on(t.regionId),
		byCreated: index('posts_created').on(t.createdAt)
	})
);

export const postVotes = pgTable(
	'post_votes',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		postId: uuid('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		vote: voteValue('vote').notNull(),
		voterLng: doublePrecision('voter_lng'),
		voterLat: doublePrecision('voter_lat'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		uniqueVote: unique('uniq_post_user_vote').on(t.postId, t.userId),
		byPost: index('votes_post').on(t.postId)
	})
);

export const postImages = pgTable(
	'post_images',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		postId: uuid('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		dataUrl: text('data_url').notNull(),
		position: integer('position').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		byPost: index('post_images_post').on(t.postId, t.position)
	})
);

export const comments = pgTable(
	'comments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		postId: uuid('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		authorId: uuid('author_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		parentId: uuid('parent_id').references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
		body: text('body').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		byPost: index('comments_post').on(t.postId),
		byParent: index('comments_parent').on(t.parentId)
	})
);

export const commentReactions = pgTable(
	'comment_reactions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		commentId: uuid('comment_id')
			.notNull()
			.references(() => comments.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		reaction: text('reaction').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		uniqueCommentReaction: unique('uniq_comment_user_reaction').on(t.commentId, t.userId),
		byComment: index('comment_reactions_comment').on(t.commentId)
	})
);

export const commentNotifications = pgTable(
	'comment_notifications',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		recipientId: uuid('recipient_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		postId: uuid('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		commentId: uuid('comment_id')
			.notNull()
			.references(() => comments.id, { onDelete: 'cascade' }),
		readAt: timestamp('read_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		uniqueRecipientComment: unique('uniq_comment_notification').on(t.recipientId, t.commentId),
		byRecipientUnread: index('comment_notifications_unread').on(t.recipientId, t.readAt, t.createdAt)
	})
);

export const reactions = pgTable(
	'reactions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		postId: uuid('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		emoji: text('emoji').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		uniqueReaction: unique('uniq_post_user_emoji').on(t.postId, t.userId, t.emoji)
	})
);

export const communityNotes = pgTable('community_notes', {
	id: uuid('id').primaryKey().defaultRandom(),
	postId: uuid('post_id')
		.notNull()
		.unique()
		.references(() => posts.id, { onDelete: 'cascade' }),
	body: text('body').notNull(),
	basedOnCommentCount: integer('based_on_comment_count').notNull(),
	generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow()
});

export const reports = pgTable('reports', {
	id: uuid('id').primaryKey().defaultRandom(),
	postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
	commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
	reporterId: uuid('reporter_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	reason: text('reason').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const signupAttempts = pgTable(
	'signup_attempts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ip: text('ip').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		byIp: index('signup_ip').on(t.ip, t.createdAt)
	})
);
