import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	try {
		event.locals.user = token ? await validateSession(token) : null;
	} catch (err) {
		console.warn('Session validation failed; continuing as a guest.', err);
		event.locals.user = null;
	}
	return resolve(event);
};
