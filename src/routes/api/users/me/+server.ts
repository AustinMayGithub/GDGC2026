import { json, error } from '@sveltejs/kit';
import { updateUserProfile } from '$lib/server/users';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401);

	const body = await request.json();
	const { displayName, bio, age, location, avatarDataUrl } = body;

	if (displayName !== undefined) {
		if (typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.trim().length > 50)
			throw error(400, 'Display name must be 2–50 characters');
	}
	if (bio !== undefined && bio !== null) {
		if (typeof bio !== 'string' || bio.length > 280)
			throw error(400, 'Bio must be under 280 characters');
	}
	if (age !== undefined && age !== null) {
		if (typeof age !== 'number' || age < 1 || age > 120)
			throw error(400, 'Age must be between 1 and 120');
	}
	if (location !== undefined && location !== null) {
		if (typeof location !== 'string' || location.length > 100)
			throw error(400, 'Location must be under 100 characters');
	}
	if (avatarDataUrl !== undefined && avatarDataUrl !== null) {
		if (typeof avatarDataUrl !== 'string' || !avatarDataUrl.startsWith('data:image/'))
			throw error(400, 'Invalid avatar format');
		if (avatarDataUrl.length > 2_500_000)
			throw error(400, 'Avatar too large (max ~2 MB)');
	}

	const updates: Record<string, unknown> = {};
	if (displayName !== undefined) updates.displayName = displayName.trim();
	if (bio !== undefined) updates.bio = bio;
	if (age !== undefined) updates.age = age;
	if (location !== undefined) updates.location = location;
	if (avatarDataUrl !== undefined) updates.avatarDataUrl = avatarDataUrl;

	await updateUserProfile(locals.user.id, updates);
	return json({ ok: true });
};
