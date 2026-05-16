import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users, emailOtps } from '$lib/server/db/schema';
import {
	verifyPassword,
	generateOtp,
	hashOtp,
	otpExpiry,
	createSession,
	encodePending,
	SESSION_COOKIE,
	PENDING_COOKIE
} from '$lib/server/auth';
import { sendOtpEmail } from '$lib/server/email';
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

		// Unverified accounts, or accounts with login-OTP enabled, go via /verify.
		if (!user.emailVerified || user.loginOtpEnabled) {
			const purpose = user.emailVerified ? 'login' : 'signup';
			const code = generateOtp();
			await db.insert(emailOtps).values({
				userId: user.id,
				codeHash: hashOtp(code),
				purpose,
				expiresAt: otpExpiry()
			});
			await sendOtpEmail(email, code, purpose);
			cookies.set(PENDING_COOKIE, encodePending(user.id, purpose), {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 60 * 15
			});
			throw redirect(303, '/auth/verify');
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
