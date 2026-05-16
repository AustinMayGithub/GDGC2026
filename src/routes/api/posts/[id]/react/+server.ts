import { json, error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { reactions } from '$lib/server/db/schema';
import { REACTIONS } from '$lib/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to react.');

	const data = await request.json().catch(() => null);
	const emoji = String(data?.emoji ?? '');
	if (!(REACTIONS as readonly string[]).includes(emoji))
		throw error(400, 'Invalid reaction.');

	const userId = locals.user.id;
	const existing = await db
		.select({ id: reactions.id })
		.from(reactions)
		.where(
			and(
				eq(reactions.postId, params.id),
				eq(reactions.userId, userId),
				eq(reactions.emoji, emoji)
			)
		);

	if (existing.length) {
		await db.delete(reactions).where(eq(reactions.id, existing[0].id));
	} else {
		await db.insert(reactions).values({ postId: params.id, userId, emoji });
	}

	const rows = await db
		.select({ emoji: reactions.emoji, userId: reactions.userId })
		.from(reactions)
		.where(eq(reactions.postId, params.id));

	const map = new Map<string, { count: number; mine: boolean }>();
	for (const r of rows) {
		const e = map.get(r.emoji) ?? { count: 0, mine: false };
		e.count++;
		if (r.userId === userId) e.mine = true;
		map.set(r.emoji, e);
	}
	const tally = [...map.entries()].map(([e, v]) => ({
		emoji: e,
		count: v.count,
		mine: v.mine
	}));
	return json({ reactions: tally });
};
