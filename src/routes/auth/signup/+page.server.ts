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
	isDisposableEmail,
	encodePending,
	PENDING_COOKIE,
	DEV_OTP_COOKIE
} from '$lib/server/auth';
import { sendOtpEmail } from '$lib/server/email';
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
		if (isDisposableEmail(email))
			return fail(400, {
				email,
				displayName,
				error: 'Disposable email addresses are not allowed.'
			});

		// Rate-limit signups per IP — max 3 per 10 minutes (project.md §3).
		const ip = getClientAddress();
		const since = new Date(Date.now() - 10 * 60 * 1000);
		const recent = await db
			.select({ id: signupAttempts.id })
			.from(signupAttempts)
			.where(and(eq(signupAttempts.ip, ip), gte(signupAttempts.createdAt, since)));
		if (recent.length >= 3)
			return fail(429, {
				email,
				displayName,
				error: 'Too many signups from this network. Please try again later.'
			});
		await db.insert(signupAttempts).values({ ip });

		const existing = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email));
		if (existing.length)
			return fail(400, { email, displayName, error: 'An account with this email already exists.' });

		const [user] = await db
			.insert(users)
			.values({ email, displayName, passwordHash: hashPassword(password) })
			.returning({ id: users.id });

		await db
			.update(emailOtps)
			.set({ used: true })
			.where(
				and(
					eq(emailOtps.userId, user.id),
					eq(emailOtps.purpose, 'signup'),
					eq(emailOtps.used, false)
				)
			);

		const code = generateOtp();
		await db.insert(emailOtps).values({
			userId: user.id,
			codeHash: hashOtp(code),
			purpose: 'signup',
			expiresAt: otpExpiry()
		});
		const delivery = await sendOtpEmail(email, code, 'signup');

		cookies.set(PENDING_COOKIE, encodePending(user.id, 'signup'), {
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
};
