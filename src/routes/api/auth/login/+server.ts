import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { emailOtps, users } from '$lib/server/db/schema';
import {
	createSession,
	DEV_OTP_COOKIE,
	encodePending,
	generateOtp,
	hashOtp,
	otpExpiry,
	PENDING_COOKIE,
	SESSION_COOKIE,
	verifyPassword
} from '$lib/server/auth';
import { sendOtpEmail } from '$lib/server/email';
import type { RequestHandler } from './$types';

function failure(message: string, status = 400) {
	return json({ message }, { status });
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => null);
	const email = String(body?.email ?? '')
		.trim()
		.toLowerCase();
	const password = String(body?.password ?? '');

	const [user] = await db.select().from(users).where(eq(users.email, email));
	if (!user || !verifyPassword(password, user.passwordHash)) {
		return failure('Incorrect email or password.');
	}

	if (!user.emailVerified || user.loginOtpEnabled) {
		const purpose = user.emailVerified ? 'login' : 'signup';
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

		const code = generateOtp();
		await db.insert(emailOtps).values({
			userId: user.id,
			codeHash: hashOtp(code),
			purpose,
			expiresAt: otpExpiry()
		});
		const delivery = await sendOtpEmail(email, code, purpose);

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

		return json({
			status: 'verify',
			email,
			purpose,
			devOtp: dev && delivery.channel === 'console' ? delivery.code : null
		});
	}

	const { token, expiresAt } = await createSession(user.id);
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt
	});

	return json({ status: 'signedIn' });
};
