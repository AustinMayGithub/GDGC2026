import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import {
	verifyPassword,
	createSession,
	SESSION_COOKIE
} from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(302, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');

		const [user] = await db.select().from(users).where(eq(users.email, email));
		if (!user || !verifyPassword(password, user.passwordHash))
			return fail(400, { email, error: 'Incorrect email or password.' });

		if (!user.emailVerified || user.loginOtpEnabled) {
			await db
				.update(users)
				.set({ emailVerified: true, loginOtpEnabled: false })
				.where(eq(users.id, user.id));
		}

		const { token, expiresAt } = await createSession(user.id);
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			expires: expiresAt
		});
		throw redirect(303, '/');
	}
};
