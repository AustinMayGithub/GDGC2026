import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts } from '$lib/server/db/schema';
import { savePostHeaderImage } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to upload images.');

	const form = await request.formData().catch(() => null);
	const file = form?.get('image');
	const postId = String(form?.get('postId') ?? '');

	if (!(file instanceof File)) {
		throw error(400, 'Choose an image to upload.');
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
		const url = await savePostHeaderImage(file, postId);
		return json({ url }, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Image upload failed.';
		throw error(400, message);
	}
};
