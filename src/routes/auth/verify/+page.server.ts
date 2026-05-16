import { error, fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users, emailOtps } from '$lib/server/db/schema';
import {
	hashOtp,
	generateOtp,
	otpExpiry,
	createSession,
	SESSION_COOKIE,
	DEV_OTP_COOKIE,
	OTP_CHALLENGE_COOKIE,
	createOtpChallenge,
	encodeOtpChallenge,
	parseOtpChallenge
} from '$lib/server/auth';
import { sendOtpEmail, type OtpDeliveryResult } from '$lib/server/email';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	if (locals.user?.emailVerified) throw redirect(302, '/');
	const challenge = parseOtpChallenge(cookies.get(OTP_CHALLENGE_COOKIE));
	if (!challenge) {
		cookies.delete(OTP_CHALLENGE_COOKIE, { path: '/auth/verify' });
		cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });
		throw redirect(302, '/auth/login');
	}

	let user: { email: string; emailVerified: boolean } | undefined;
	try {
		const rows = await db
			.select({ email: users.email, emailVerified: users.emailVerified })
			.from(users)
			.where(eq(users.id, challenge.userId));
		user = rows[0];
	} catch (err) {
		console.error('[verify] failed to load pending user:', err);
		throw error(500, 'We could not load verification right now. Please try again.');
	}
	if (!user) throw redirect(302, '/auth/login');
	if (challenge.purpose === 'signup' && user.emailVerified) {
		cookies.delete(OTP_CHALLENGE_COOKIE, { path: '/auth/verify' });
		cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });
		throw redirect(302, '/auth/login');
	}

	const devOtp = dev ? cookies.get(DEV_OTP_COOKIE) ?? null : null;
	return { email: user.email, purpose: challenge.purpose, devOtp };
};

export const actions: Actions = {
	verify: async ({ request, cookies }) => {
		const challenge = parseOtpChallenge(cookies.get(OTP_CHALLENGE_COOKIE));
		if (!challenge) {
			cookies.delete(OTP_CHALLENGE_COOKIE, { path: '/auth/verify' });
			cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });
			throw redirect(302, '/auth/login');
		}

		let pendingUser: { emailVerified: boolean } | undefined;
		try {
			const rows = await db
				.select({ emailVerified: users.emailVerified })
				.from(users)
				.where(eq(users.id, challenge.userId));
			pendingUser = rows[0];
		} catch (err) {
			console.error('[verify] failed to load pending user:', err);
			return fail(500, { error: 'We could not check that code right now. Please try again.' });
		}
		if (!pendingUser) throw redirect(302, '/auth/login');
		if (challenge.purpose === 'signup' && pendingUser.emailVerified) {
			cookies.delete(OTP_CHALLENGE_COOKIE, { path: '/auth/verify' });
			cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });
			throw redirect(303, '/auth/login');
		}

		const form = await request.formData();
		const code = String(form.get('code') ?? '').trim();
		if (!/^\d{6}$/.test(code)) return fail(400, { error: 'Enter the 6-digit code.' });
		const codeHash = hashOtp(code);

		let otp: typeof emailOtps.$inferSelect | undefined;
		try {
			const rows = await db
				.select()
				.from(emailOtps)
				.where(
					and(
						eq(emailOtps.userId, challenge.userId),
						eq(emailOtps.purpose, challenge.purpose),
						eq(emailOtps.used, false),
						eq(emailOtps.codeHash, codeHash)
					)
				)
				.orderBy(desc(emailOtps.createdAt))
				.limit(1);
			otp = rows[0];
		} catch (err) {
			console.error('[verify] failed to check OTP:', err);
			return fail(500, { error: 'We could not check that code right now. Please try again.' });
		}

		if (!otp || otp.expiresAt.getTime() < Date.now())
			return fail(400, { error: 'That code is invalid or has expired.' });

		let session: Awaited<ReturnType<typeof createSession>>;
		try {
			// Burn every still-open OTP for this flow after a successful verification.
			await db
				.update(emailOtps)
				.set({ used: true })
				.where(
					and(
						eq(emailOtps.userId, challenge.userId),
						eq(emailOtps.purpose, challenge.purpose),
						eq(emailOtps.used, false)
					)
				);
			if (challenge.purpose === 'signup')
				await db
					.update(users)
					.set({ emailVerified: true })
					.where(eq(users.id, challenge.userId));

			session = await createSession(challenge.userId);
		} catch (err) {
			console.error('[verify] failed to complete verification:', err);
			return fail(500, {
				error: 'We could not finish verification right now. Please try again.'
			});
		}
		cookies.set(SESSION_COOKIE, session.token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			expires: session.expiresAt
		});
		cookies.delete(OTP_CHALLENGE_COOKIE, { path: '/auth/verify' });
		cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });
		throw redirect(303, '/');
	},

	resend: async ({ cookies }) => {
		const challenge = parseOtpChallenge(cookies.get(OTP_CHALLENGE_COOKIE));
		if (!challenge) {
			cookies.delete(OTP_CHALLENGE_COOKIE, { path: '/auth/verify' });
			cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });
			throw redirect(302, '/auth/login');
		}

		let user: { email: string; emailVerified: boolean } | undefined;
		try {
			const rows = await db
				.select({ email: users.email, emailVerified: users.emailVerified })
				.from(users)
				.where(eq(users.id, challenge.userId));
			user = rows[0];
		} catch (err) {
			console.error('[verify] failed to load user for resend:', err);
			return fail(500, { error: 'We could not resend a code right now. Please try again.' });
		}
		if (!user) throw redirect(302, '/auth/login');
		if (challenge.purpose === 'signup' && user.emailVerified) {
			cookies.delete(OTP_CHALLENGE_COOKIE, { path: '/auth/verify' });
			cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });
			throw redirect(303, '/auth/login');
		}

		const code = generateOtp();
		let delivery: OtpDeliveryResult;
		try {
			// Keep resend deterministic: only the most recent code remains usable.
			await db
				.update(emailOtps)
				.set({ used: true })
				.where(
					and(
						eq(emailOtps.userId, challenge.userId),
						eq(emailOtps.purpose, challenge.purpose),
						eq(emailOtps.used, false)
					)
				);
			await db.insert(emailOtps).values({
				userId: challenge.userId,
				codeHash: hashOtp(code),
				purpose: challenge.purpose,
				expiresAt: otpExpiry()
			});
			delivery = await sendOtpEmail(user.email, code, challenge.purpose);
		} catch (err) {
			console.error('[verify] failed to resend verification code:', err);
			return fail(500, { error: 'We could not resend a code right now. Please try again.' });
		}
		cookies.set(
			OTP_CHALLENGE_COOKIE,
			encodeOtpChallenge(createOtpChallenge(challenge.userId, challenge.purpose)),
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
			return { resent: true, devOtp: delivery.code };
		}
		cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });
		return { resent: true };
	}
};
