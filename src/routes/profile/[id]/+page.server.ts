import { getUserProfile } from '$lib/server/users';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const profile = await getUserProfile(params.id);
	if (!profile) throw error(404, 'User not found');
	return { profile, isOwn: locals.user?.id === params.id };
};
