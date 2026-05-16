import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { and, eq } from 'drizzle-orm';
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
	PENDING_COOKIE,
	DEV_OTP_COOKIE
} from '$lib/server/auth';
import { sendOtpEmail, type OtpDeliveryResult } from '$lib/server/email';
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

		let user: typeof users.$inferSelect | undefined;
		try {
			const rows = await db.select().from(users).where(eq(users.email, email));
			user = rows[0];
		} catch (err) {
			console.error('[login] failed to load user:', err);
			return fail(500, { email, error: 'We could not sign you in right now. Please try again.' });
		}
		if (!user || !verifyPassword(password, user.passwordHash))
			return fail(400, { email, error: 'Incorrect email or password.' });

		// Unverified accounts, or accounts with login-OTP enabled, go via /verify.
		if (!user.emailVerified || user.loginOtpEnabled) {
			const purpose = user.emailVerified ? 'login' : 'signup';
			const code = generateOtp();
			let delivery: OtpDeliveryResult;
			try {
				await db
					.update(emailOtps)
					.set({ used: true })
					.where(
						and(
							eq(emailOtps.userId, user.id),
							eq(emailOtps.purpose, purpose),
							eq(emailOtps.used, false)
						)
					);
				await db.insert(emailOtps).values({
					userId: user.id,
					codeHash: hashOtp(code),
					purpose,
					expiresAt: otpExpiry()
				});
				delivery = await sendOtpEmail(email, code, purpose);
			} catch (err) {
				console.error('[login] failed to issue verification code:', err);
				return fail(500, {
					email,
					error: 'We could not send a verification code right now. Please try again.'
				});
			}
			cookies.set(PENDING_COOKIE, encodePending(user.id, purpose), {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 60 * 15
			});
			if (dev && delivery.channel === 'console') {
				cookies.set(DEV_OTP_COOKIE, delivery.code, {
					path: '/auth/verify',
					httpOnly: true,
					sameSite: 'lax',
					maxAge: 60 * 15
				});
			} else {
				cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });
			}
			throw redirect(303, '/auth/verify');
		}

		let session: Awaited<ReturnType<typeof createSession>>;
		try {
			session = await createSession(user.id);
		} catch (err) {
			console.error('[login] failed to create session:', err);
			return fail(500, { email, error: 'We could not sign you in right now. Please try again.' });
		}
		cookies.set(SESSION_COOKIE, session.token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			expires: session.expiresAt
		});
		throw redirect(303, '/');
	}
};
