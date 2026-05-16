import { db } from '$lib/server/db';
import { posts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const [row] = await db
		.select({ headerImageDataUrl: posts.headerImageDataUrl })
		.from(posts)
		.where(eq(posts.id, params.id));

	if (!row?.headerImageDataUrl) throw error(404);

	const [meta, base64] = row.headerImageDataUrl.split(',');
	const mimeType = meta.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
	const buffer = Buffer.from(base64, 'base64');

	return new Response(buffer, {
		headers: {
			'Content-Type': mimeType,
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
