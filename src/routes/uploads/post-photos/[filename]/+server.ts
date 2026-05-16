import { error } from '@sveltejs/kit';
import { readPostPhoto } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const image = await readPostPhoto(params.filename);
	if (!image) throw error(404, 'Photo not found.');

	return new Response(image.bytes, {
		headers: {
			'Content-Type': image.contentType,
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
