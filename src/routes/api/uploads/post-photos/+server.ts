import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts } from '$lib/server/db/schema';
import { savePostPhotos } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to upload photos.');

	const form = await request.formData().catch(() => null);
	const postId = String(form?.get('postId') ?? '');
	const files = form?.getAll('photos') ?? [];
	const photos = files.filter((file): file is File => file instanceof File);

	if (photos.length === 0) {
		throw error(400, 'Choose at least one photo to upload.');
	}

	const [post] = await db
		.select({ authorId: posts.authorId })
		.from(posts)
		.where(eq(posts.id, postId))
		.limit(1);

	if (!post || post.authorId !== locals.user.id) {
		throw error(404, 'Post not found.');
	}

	try {
		const urls = await savePostPhotos(photos, postId);
		return json({ urls }, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Photo upload failed.';
		throw error(400, message);
	}
};
