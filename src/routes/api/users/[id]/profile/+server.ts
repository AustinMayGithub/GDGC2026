import { error, json } from '@sveltejs/kit';
import { getUserProfile } from '$lib/server/users';
import {
	getUnreadCommentNotifications,
	markCommentNotificationsRead
} from '$lib/server/notifications';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const profile = await getUserProfile(params.id);
	if (!profile) throw error(404, 'User not found');

	const isOwn = locals.user?.id === params.id;
	if (isOwn) {
		profile.newComments = await getUnreadCommentNotifications(params.id);
		await markCommentNotificationsRead(params.id);
	} else {
		profile.posts = profile.posts.filter((post) => !post.anonymous);
	}

	return json({ profile, isOwn });
};
