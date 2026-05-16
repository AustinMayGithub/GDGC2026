import { getUserProfile } from '$lib/server/users';
import {
	getUnreadCommentNotifications,
	markCommentNotificationsRead
} from '$lib/server/notifications';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const profile = await getUserProfile(params.id);
	if (!profile) throw error(404, 'User not found');
	const isOwn = locals.user?.id === params.id;
	if (isOwn) {
		profile.newComments = await getUnreadCommentNotifications(params.id);
		await markCommentNotificationsRead(params.id);
	} else {
		profile.posts = profile.posts.filter((p) => !p.anonymous);
	}
	return { profile, isOwn };
};
