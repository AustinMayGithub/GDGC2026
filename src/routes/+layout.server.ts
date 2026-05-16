import type { LayoutServerLoad } from './$types';
import { hasUnreadCommentNotifications } from '$lib/server/notifications';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		coarseLocation: locals.coarseLocation,
		hasUnreadNotifications: locals.user
			? await hasUnreadCommentNotifications(locals.user.id)
			: false
	};
};
