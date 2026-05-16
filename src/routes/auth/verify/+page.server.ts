import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users, emailOtps } from '$lib/server/db/schema';
import {
	hashOtp,
	normalizeOtp,
	generateOtp,
	otpExpiry,
	createSession,
	parsePending,
	SESSION_COOKIE,
	PENDING_COOKIE,
	DEV_OTP_COOKIE
} from '$lib/server/auth';
import { sendOtpEmail } from '$lib/server/email';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	if (locals.user?.emailVerified) throw redirect(302, '/');
	const pending = parsePending(cookies.get(PENDING_COOKIE));
	if (!pending) throw redirect(302, '/auth/login');

	const [user] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, pending.userId));
	if (!user) throw redirect(302, '/auth/login');

	const devOtp = dev ? cookies.get(DEV_OTP_COOKIE) ?? null : null;
	return { email: user.email, purpose: pending.purpose, devOtp };
};

export const actions: Actions = {
	verify: async ({ request, cookies }) => {
		const pending = parsePending(cookies.get(PENDING_COOKIE));
		if (!pending) throw redirect(302, '/auth/login');

		const form = await request.formData();
		const code = normalizeOtp(String(form.get('code') ?? ''));
		if (!/^\d{6}$/.test(code)) return fail(400, { error: 'Enter the 6-digit code.' });
		const codeHash = hashOtp(code);

		const [otp] = await db
			.select()
			.from(emailOtps)
			.where(
				and(
					eq(emailOtps.userId, pending.userId),
					eq(emailOtps.purpose, pending.purpose),
					eq(emailOtps.used, false),
					eq(emailOtps.codeHash, codeHash)
				)
			)
			.orderBy(desc(emailOtps.createdAt))
			.limit(1);

		if (!otp || otp.expiresAt.getTime() < Date.now())
			return fail(400, { error: 'That code is invalid or has expired.' });

		// Burn every still-open OTP for this flow after a successful verification.
		await db
			.update(emailOtps)
			.set({ used: true })
			.where(
				and(
					eq(emailOtps.userId, pending.userId),
					eq(emailOtps.purpose, pending.purpose),
					eq(emailOtps.used, false)
				)
			);
		if (pending.purpose === 'signup')
			await db
				.update(users)
				.set({ emailVerified: true })
				.where(eq(users.id, pending.userId));

		const { token, expiresAt } = await createSession(pending.userId);
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			expires: expiresAt
		});
		cookies.delete(PENDING_COOKIE, { path: '/' });
		cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });
		throw redirect(303, '/');
	},

	resend: async ({ cookies }) => {
		const pending = parsePending(cookies.get(PENDING_COOKIE));
		if (!pending) throw redirect(302, '/auth/login');

		const [user] = await db
			.select({ email: users.email })
			.from(users)
			.where(eq(users.id, pending.userId));
		if (!user) throw redirect(302, '/auth/login');

		// Keep resend deterministic: only the most recent code remains usable.
		await db
			.update(emailOtps)
			.set({ used: true })
			.where(
				and(
					eq(emailOtps.userId, pending.userId),
					eq(emailOtps.purpose, pending.purpose),
					eq(emailOtps.used, false)
				)
			);

		const code = generateOtp();
		await db.insert(emailOtps).values({
			userId: pending.userId,
			codeHash: hashOtp(code),
			purpose: pending.purpose,
			expiresAt: otpExpiry()
		});
		const delivery = await sendOtpEmail(user.email, code, pending.purpose);
		if (dev && delivery.channel === 'console') {
			cookies.set(DEV_OTP_COOKIE, delivery.code, {
				path: '/auth/verify',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 60 * 15
			});
			return { resent: true, devOtp: delivery.code };
		}
		cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });
		return { resent: true };
	}
};
