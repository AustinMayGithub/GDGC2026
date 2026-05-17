import { env } from '$env/dynamic/private';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { posts, comments, communityNotes, commentReactions, users } from './db/schema';
import type { CommunityNote } from '$lib/types';
import { fallbackAreaLabel } from '$lib/data/geo-labels';

const NOTE_MODEL = 'gpt-4o-mini';
const MAX_COMMENTS_IN_PROMPT = 20;
const CRIMINAL_FACILITATION_PROMPT = `Classify whether a community post is trying to ASSIST criminal activity.

Return exactly one word: BLOCK or ALLOW.

BLOCK only if the text is attempting to help arrange, coordinate, advertise, sell, distribute, instruct, recruit for, or evade enforcement around criminal activity.
Examples that should BLOCK:
- drug drop off 0900-2100
- selling stolen bikes, DM for pickup
- instructions for bypassing alarms
- who wants to help move illegal weapons

ALLOW everything else, including:
- reporting, warning about, or discussing crime
- criticism, accusations, news, local safety alerts, or requests for help
- profanity, anger, graphic descriptions, politics, or controversial opinions
- "Someone is doing drug drop offs near the park"

If intent is unclear, ALLOW.`;

// The note's only job: summarise the OPINIONS in the comment thread.
// No verdict, no fact-check (project.md §4.5 - resolved per user direction).
const SYSTEM_PROMPT = `Write a short Community Notes-style note that relates directly to the post and helps readers judge whether the post's claim is correct, incomplete, or disputed, using ONLY the supplied comments, replies, likes, and dislikes as evidence.

Format:
- One neutral paragraph.
- 1-2 short sentences.
- Under 55 words.
- Plain, careful wording like: "Readers add that..." or "Comments dispute this, saying..."

Strict rules:
- First decide which comments are directly about the post headline/claim. Ignore off-topic comments, side conversations, jokes, personal arguments, moderation talk, UI feedback, unrelated politics, and replies that do not add post-related context.
- Likes and dislikes on off-topic comments must not influence the note.
- If a reply is off-topic but its parent is relevant, ignore only the off-topic reply. If a parent is off-topic but a reply directly addresses the post, you may use the reply.
- Every claim in the note must be directly traceable to at least one supplied comment.
- Treat replies as part of the discussion around the comment they answer.
- Use likes and dislikes as community weighting signals, not as proof.
- Do NOT use outside knowledge.
- Use the post headline only to understand what claim the comments are responding to.
- If comments clearly correct the post, state the correction as comment-supplied context, e.g. "Comments dispute this, saying..."
- If comments support the post, say readers support or corroborate it, based only on comments.
- If comments disagree, say the claim is disputed and briefly explain both sides.
- If comments do not provide useful verification/correction, say the comments do not add clear confirming or corrective context.
- Do NOT infer causes, motives, timelines, numbers, official positions, sources, locations, or outcomes unless comments explicitly say them.
- Do NOT present comment claims as independently verified facts.
- Do NOT mention "several" unless at least two comments support that point. Use "one reader" for a single comment.
- No bullet points, no quotes, no citations, no emojis.`;

async function getClient() {
	if (!env.OPENAI_API_KEY) return null;
	const { default: OpenAI } = await import('openai');
	return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

/**
 * Returns true if the text is allowed, false if it should be blocked.
 * With no API key configured, content is allowed (dev mode).
 */
export async function moderateText(text: string): Promise<boolean> {
	const client = await getClient();
	if (!client) return true;
	try {
		const res = await client.chat.completions.create({
			model: NOTE_MODEL,
			max_tokens: 3,
			temperature: 0,
			messages: [
				{ role: 'system', content: CRIMINAL_FACILITATION_PROMPT },
				{ role: 'user', content: text.slice(0, 8000) }
			]
		});
		const decision = res.choices[0]?.message.content?.trim().toUpperCase();
		const shouldBlock = decision === 'BLOCK';

		if (shouldBlock) {
			console.warn('[ai] moderation blocked criminal facilitation content.');
		}

		return !shouldBlock;
	} catch (err) {
		console.error('[ai] moderation call failed, allowing content:', err);
		return true;
	}
}

export async function generateAreaLabel(params: {
	lng: number;
	lat: number;
	radiusM: number;
	regionName: string;
	nearestPlace: string;
	nearestPlaceKind?: string;
	nearestPlaceDistanceKm?: number;
	nearestPlaceDirection?: string;
	nearbyPlaces?: string[];
}): Promise<string> {
	const fallback = fallbackAreaLabel(params.lng, params.lat, params.radiusM);
	const client = await getClient();
	if (!client) return fallback;

	try {
		const res = await client.chat.completions.create({
			model: NOTE_MODEL,
			max_tokens: 24,
			temperature: 0.2,
			messages: [
				{
					role: 'system',
					content:
						'Create a short, specific New Zealand map area label. Return 2-5 words only. No coordinates. No punctuation. Prefer the nearest suburb/town or a directional phrase over broad regional wording. Match the radius: tiny areas can say "around" or "streets"; medium areas can say "neighbourhood" or "district"; large areas can use the region. Do not stack qualifiers like "near X streets". Examples: "Around Mount Eden", "Te Aro streets", "East of Hamilton", "Riccarton neighbourhood", "Wider Wellington region".'
				},
				{
					role: 'user',
					content: `Nearest place: ${params.nearestPlace}
Nearest place type: ${params.nearestPlaceKind ?? 'place'}
Distance from nearest place: ${params.nearestPlaceDistanceKm?.toFixed(1) ?? 'unknown'} km
Direction from nearest place: ${params.nearestPlaceDirection ?? 'unknown'}
Other nearby places: ${params.nearbyPlaces?.join(', ') || 'none'}
Region: ${params.regionName}
Radius metres: ${params.radiusM}
Fallback label: ${fallback}`
				}
			]
		});

		const label = res.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, '');
		if (!label || label.length > 48 || /[-\d.]+,\s*[-\d.]+/.test(label)) return fallback;
		return label;
	} catch (err) {
		console.error('[ai] area label generation failed:', err);
		return fallback;
	}
}

async function countComments(postId: string): Promise<number> {
	const [row] = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(comments)
		.where(eq(comments.postId, postId));
	return row?.c ?? 0;
}

type CommentNoteInput = {
	body: string;
	authorName: string;
	parentBody: string | null;
	likeCount: number;
	dislikeCount: number;
};

async function summariseOpinions(title: string, commentsForNote: CommentNoteInput[]): Promise<string | null> {
	const client = await getClient();
	if (!client) return null;
	const list = commentsForNote
		.slice(0, MAX_COMMENTS_IN_PROMPT)
		.map((c, i) => {
			const replyContext = c.parentBody ? ` replyTo="${c.parentBody.slice(0, 180)}"` : '';
			return `<comment id="${i + 1}" author="${c.authorName}" likes="${c.likeCount}" dislikes="${c.dislikeCount}"${replyContext}>${c.body.slice(0, 500)}</comment>`;
		})
		.join('\n');
	try {
		const res = await client.chat.completions.create({
			model: NOTE_MODEL,
			max_tokens: 90,
			temperature: 0,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{
					role: 'user',
					content: `Post headline/claim: "${title}"\n\nComments, replies, and community reaction counts:\n${list}\n\nDiscard comments that are not directly about the post headline/claim, even if they have many likes or replies. Then write a community note that clarifies, corrects, supports, or flags uncertainty about the post based only on the remaining post-related comments and their like/dislike/reply signals.`
				}
			]
		});
		return res.choices[0]?.message?.content?.replace(/\u{1f916}/gu, '').trim() || null;
	} catch (err) {
		console.error('[ai] note generation failed:', err);
		return null;
	}
}

/**
 * Regenerates the community note for a factual post.
 * Safe to call after every comment - never throws.
 */
export async function maybeRegenerateNote(postId: string): Promise<CommunityNote | null> {
	try {
		const [post] = await db
			.select({ title: posts.title, category: posts.category })
			.from(posts)
			.where(eq(posts.id, postId));
		if (!post || post.category !== 'factual') return null;

		const recent = await db
			.select({
				id: comments.id,
				parentId: comments.parentId,
				body: comments.body,
				authorName: users.displayName,
				likeCount: sql<number>`(
					select count(*)::int
					from ${commentReactions}
					where ${commentReactions.commentId} = ${comments.id}
						and ${commentReactions.reaction} = 'like'
				)`,
				dislikeCount: sql<number>`(
					select count(*)::int
					from ${commentReactions}
					where ${commentReactions.commentId} = ${comments.id}
						and ${commentReactions.reaction} = 'dislike'
				)`
			})
			.from(comments)
			.innerJoin(users, eq(comments.authorId, users.id))
			.where(eq(comments.postId, postId))
			.orderBy(desc(sql<number>`(
				(
					select count(*)::int
					from ${commentReactions}
					where ${commentReactions.commentId} = ${comments.id}
						and ${commentReactions.reaction} = 'like'
				) * 2
				-
				(
					select count(*)::int
					from ${commentReactions}
					where ${commentReactions.commentId} = ${comments.id}
						and ${commentReactions.reaction} = 'dislike'
				)
			)`), desc(comments.createdAt))
			.limit(MAX_COMMENTS_IN_PROMPT);
		if (recent.length === 0) return null; // no comments, no note

		const total = await countComments(postId);
		const bodyById = new Map(recent.map((comment) => [comment.id, comment.body]));
		const body = await summariseOpinions(
			post.title,
			recent.map((c) => ({
				body: c.body,
				authorName: c.authorName,
				parentBody: c.parentId ? (bodyById.get(c.parentId) ?? null) : null,
				likeCount: c.likeCount,
				dislikeCount: c.dislikeCount
			}))
		);
		if (!body) return null;

		const generatedAt = new Date();
		const [note] = await db
			.insert(communityNotes)
			.values({ postId, body, basedOnCommentCount: total, generatedAt })
			.onConflictDoUpdate({
				target: communityNotes.postId,
				set: { body, basedOnCommentCount: total, generatedAt }
			})
			.returning({
				body: communityNotes.body,
				generatedAt: communityNotes.generatedAt,
				basedOnCommentCount: communityNotes.basedOnCommentCount
			});

		return note
			? {
					body: note.body,
					generatedAt: note.generatedAt.toISOString(),
					basedOnCommentCount: note.basedOnCommentCount
				}
			: null;
	} catch (err) {
		console.error('[ai] maybeRegenerateNote failed:', err);
		return null;
	}
}
