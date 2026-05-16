import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { posts } from '$lib/server/db/schema';
import { regionForPoint } from '$lib/data/nz-regions';
import { listPosts } from '$lib/server/posts';
import { moderateText } from '$lib/server/ai';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const scope = url.searchParams.get('scope');
	const regionId = url.searchParams.get('regionId') ?? undefined;
	try {
		const list = await listPosts({ regionId: scope === 'local' ? regionId : undefined });
		return json({ posts: list });
	} catch (err) {
		console.warn('Post feed failed; returning an empty feed so the page can render.', err);
		return json({ posts: [] });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to post.');

	const data = await request.json().catch(() => null);
	if (!data) throw error(400, 'Invalid request body.');

	const title = String(data.title ?? '').trim();
	const body = String(data.body ?? '').trim();
	const headerImageDataUrl =
		typeof data.headerImageDataUrl === 'string' && data.headerImageDataUrl.trim()
			? data.headerImageDataUrl.trim()
			: null;
	const category =
		data.category === 'personal' || data.category === 'factual' ? data.category : null;
	const lng = Number(data.lng);
	const lat = Number(data.lat);
	const impactRadiusM = Math.round(Number(data.impactRadiusM));

	if (title.length < 4 || title.length > 140)
		throw error(400, 'Title must be 4–140 characters.');
	if (body.length < 10 || body.length > 5000)
		throw error(400, 'Body must be 10–5000 characters.');
	if (
		headerImageDataUrl &&
		(!headerImageDataUrl.startsWith('data:image/jpeg;base64,') ||
			headerImageDataUrl.length > 1_500_000)
	)
		throw error(400, 'Header image must be a cropped JPEG under 1.5 MB.');
	if (!category) throw error(400, 'Choose a post category.');
	if (!Number.isFinite(lng) || !Number.isFinite(lat))
		throw error(400, 'Pick a location on the map.');
	if (!Number.isFinite(impactRadiusM) || impactRadiusM < 100 || impactRadiusM > 300000)
		throw error(400, 'Set an affected location between 100 m and 300 km.');

	const allowed = await moderateText(`${title}\n\n${body}`);
	if (!allowed)
		throw error(422, 'This content was flagged by moderation and cannot be posted.');

	const [post] = await db
		.insert(posts)
		.values({
			authorId: locals.user.id,
			title,
			body,
			headerImageDataUrl,
			category,
			lng,
			lat,
			impactRadiusM,
			regionId: regionForPoint(lng, lat)
		})
		.returning({ id: posts.id });

	return json({ id: post.id }, { status: 201 });
};
