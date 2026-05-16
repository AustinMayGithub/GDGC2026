import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { and, eq, gte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users, emailOtps, signupAttempts } from '$lib/server/db/schema';
import {
	hashPassword,
	generateOtp,
	hashOtp,
	otpExpiry,
	DEV_OTP_COOKIE,
	OTP_CHALLENGE_COOKIE,
	createOtpChallenge,
	encodeOtpChallenge
} from '$lib/server/auth';
import { sendOtpEmail, type OtpDeliveryResult } from '$lib/server/email';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(302, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const displayName = String(form.get('displayName') ?? '').trim();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');

		if (displayName.length < 2)
			return fail(400, { email, displayName, error: 'Please enter your name.' });
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
			return fail(400, { email, displayName, error: 'Please enter a valid email address.' });
		if (password.length < 8)
			return fail(400, { email, displayName, error: 'Password must be at least 8 characters.' });

		const ip = getClientAddress();
		const since = new Date(Date.now() - 10 * 60 * 1000);
		let recent: { id: string }[];
		try {
			recent = await db
				.select({ id: signupAttempts.id })
				.from(signupAttempts)
				.where(and(eq(signupAttempts.ip, ip), gte(signupAttempts.createdAt, since)));
		} catch (err) {
			console.error('[signup] failed to check signup rate limit:', err);
			return fail(500, {
				email,
				displayName,
				error: 'We could not start signup right now. Please try again.'
			});
		}
		if (recent.length >= 3)
			return fail(429, {
				email,
				displayName,
				error: 'Too many signups from this network. Please try again later.'
			});

		try {
			await db.insert(signupAttempts).values({ ip });
		} catch (err) {
			console.error('[signup] failed to record signup attempt:', err);
			return fail(500, {
				email,
				displayName,
				error: 'We could not start signup right now. Please try again.'
			});
		}

		let userId: string;
		try {
			const [existing] = await db
				.select({ id: users.id, emailVerified: users.emailVerified })
				.from(users)
				.where(eq(users.email, email));

			if (existing?.emailVerified) {
				return fail(400, {
					email,
					displayName,
					error: 'A verified account with this email already exists.'
				});
			}

			if (existing) {
				await db
					.update(users)
					.set({
						displayName,
						passwordHash: hashPassword(password),
						emailVerified: false,
						loginOtpEnabled: false
					})
					.where(eq(users.id, existing.id));
				userId = existing.id;
			} else {
				const [user] = await db
					.insert(users)
					.values({ email, displayName, passwordHash: hashPassword(password) })
					.returning({ id: users.id });
				if (!user) throw new Error('User insert did not return an id.');
				userId = user.id;
			}
		} catch (err) {
			console.error('[signup] failed to create or reclaim account:', err);
			return fail(500, {
				email,
				displayName,
				error: 'We could not create that account right now. Please try again.'
			});
		}

		const code = generateOtp();
		let delivery: OtpDeliveryResult;
		try {
			await db
				.update(emailOtps)
				.set({ used: true })
				.where(
					and(
						eq(emailOtps.userId, userId),
						eq(emailOtps.purpose, 'signup'),
						eq(emailOtps.used, false)
					)
				);
			await db.insert(emailOtps).values({
				userId,
				codeHash: hashOtp(code),
				purpose: 'signup',
				expiresAt: otpExpiry()
			});
			delivery = await sendOtpEmail(email, code, 'signup');
		} catch (err) {
			console.error('[signup] failed to issue verification code:', err);
			return fail(500, {
				email,
				displayName,
				error: 'We could not send a verification code right now. Please try again.'
			});
		}

		cookies.set(
			OTP_CHALLENGE_COOKIE,
			encodeOtpChallenge(createOtpChallenge(userId, 'signup')),
			{
				path: '/auth/verify',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 60 * 15
			}
		);
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
};
