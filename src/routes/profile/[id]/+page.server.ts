import { getUserProfile } from '$lib/server/users';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const profile = await getUserProfile(params.id);
	if (!profile) throw error(404, 'User not found');
	const isOwn = locals.user?.id === params.id;
	if (!isOwn) profile.posts = profile.posts.filter((p) => !p.anonymous);
	return { profile, isOwn };
};
