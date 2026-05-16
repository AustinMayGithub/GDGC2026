import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const [row] = await db
		.select({ avatarDataUrl: users.avatarDataUrl })
		.from(users)
		.where(eq(users.id, params.id));

	if (!row?.avatarDataUrl) throw error(404);

	const [meta, base64] = row.avatarDataUrl.split(',');
	const mimeType = meta.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
	const buffer = Buffer.from(base64, 'base64');

	return new Response(buffer, {
		headers: {
			'Content-Type': mimeType,
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
