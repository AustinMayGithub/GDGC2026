import { error, json } from '@sveltejs/kit';
import { savePostHeaderImage } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to upload images.');

	const form = await request.formData().catch(() => null);
	const file = form?.get('image');

	if (!(file instanceof File)) {
		throw error(400, 'Choose an image to upload.');
	}

	try {
		const url = await savePostHeaderImage(file);
		return json({ url }, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Image upload failed.';
		throw error(400, message);
	}
};
