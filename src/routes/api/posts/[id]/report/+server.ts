import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { reports } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to report.');

	const data = await request.json().catch(() => null);
	const targetType = data?.targetType;
	const reason = String(data?.reason ?? '')
		.trim()
		.slice(0, 500);

	if (targetType === 'post') {
		await db.insert(reports).values({
			postId: params.id,
			reporterId: locals.user.id,
			reason: reason || 'unspecified'
		});
	} else if (targetType === 'comment') {
		const commentId = String(data?.targetId ?? '');
		if (!commentId) throw error(400, 'Missing comment id.');
		await db.insert(reports).values({
			commentId,
			reporterId: locals.user.id,
			reason: reason || 'unspecified'
		});
	} else {
		throw error(400, 'Invalid report target.');
	}

	return json({ ok: true });
};
