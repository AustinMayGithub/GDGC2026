import { env } from '$env/dynamic/private';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { posts, comments, communityNotes } from './db/schema';
import type { CommunityNote } from '$lib/types';
import { fallbackAreaLabel } from '$lib/data/geo-labels';

const NOTE_MODEL = 'gpt-4o-mini';
const MAX_COMMENTS_IN_PROMPT = 20;

// The note's only job: summarise the OPINIONS in the comment thread.
// No verdict, no fact-check (project.md §4.5 — resolved per user direction).
const SYSTEM_PROMPT = `You write a single neutral paragraph summarising the OPINIONS expressed in a comment thread on a community news platform.

Your only job is to describe what commenters think: the range of views, where they agree, where they disagree.

Strict rules:
- Do NOT fact-check the post or the comments.
- Do NOT state or imply whether the post is true, false, accurate, inaccurate, credible, confirmed, debunked, or misleading.
- Do NOT add your own opinion, judgement, or assessment.
- Do NOT mention evidence or sources unless commenters themselves bring them up.
- Stay under 70 words. Plain, readable English.`;

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
		const res = await client.moderations.create({
			model: 'omni-moderation-latest',
			input: text.slice(0, 8000)
		});
		return !res.results[0]?.flagged;
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
						'Create a short New Zealand map area label. Return 2-5 words only. No coordinates. No punctuation. Be natural but restrained, like "Wider Howick area", "Botany local district", or "Auckland regional area".'
				},
				{
					role: 'user',
					content: `Nearest place: ${params.nearestPlace}
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

async function summariseOpinions(title: string, bodies: string[]): Promise<string | null> {
	const client = await getClient();
	if (!client) return null;
	const list = bodies
		.slice(0, MAX_COMMENTS_IN_PROMPT)
		.map((b, i) => `${i + 1}. ${b.slice(0, 200)}`)
		.join('\n');
	try {
		const res = await client.chat.completions.create({
			model: NOTE_MODEL,
			max_tokens: 200,
			temperature: 0.3,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{
					role: 'user',
					content: `Post headline: "${title}"\n\nComments:\n${list}\n\nSummarise the opinions expressed in these comments.`
				}
			]
		});
		return res.choices[0]?.message?.content?.trim() || null;
	} catch (err) {
		console.error('[ai] note generation failed:', err);
		return null;
	}
}

/**
 * Regenerates the community note for a factual post.
 * Safe to call after every comment — never throws.
 */
export async function maybeRegenerateNote(postId: string): Promise<CommunityNote | null> {
	try {
		const [post] = await db
			.select({ title: posts.title, category: posts.category })
			.from(posts)
			.where(eq(posts.id, postId));
		if (!post || post.category !== 'factual') return null;

		const recent = await db
			.select({ body: comments.body })
			.from(comments)
			.where(eq(comments.postId, postId))
			.orderBy(desc(comments.createdAt))
			.limit(MAX_COMMENTS_IN_PROMPT);
		if (recent.length === 0) return null; // no comments → no note

		const total = await countComments(postId);
		const body = await summariseOpinions(
			post.title,
			recent.map((c) => c.body)
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
