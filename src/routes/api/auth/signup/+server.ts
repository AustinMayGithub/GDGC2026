import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import { and, eq, gte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { emailOtps, signupAttempts, users } from '$lib/server/db/schema';
import {
	DEV_OTP_COOKIE,
	encodePending,
	generateOtp,
	hashOtp,
	hashPassword,
	isDisposableEmail,
	otpExpiry,
	PENDING_COOKIE
} from '$lib/server/auth';
import { sendOtpEmail } from '$lib/server/email';
import type { RequestHandler } from './$types';

function failure(message: string, status = 400) {
	return json({ message }, { status });
}

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const body = await request.json().catch(() => null);
	const displayName = String(body?.displayName ?? '').trim();
	const email = String(body?.email ?? '')
		.trim()
		.toLowerCase();
	const password = String(body?.password ?? '');

	if (displayName.length < 2) return failure('Please enter your name.');
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
		return failure('Please enter a valid email address.');
	}
	if (password.length < 8) return failure('Password must be at least 8 characters.');
	if (isDisposableEmail(email)) return failure('Disposable email addresses are not allowed.');

	const ip = getClientAddress();
	const since = new Date(Date.now() - 10 * 60 * 1000);
	const recent = await db
		.select({ id: signupAttempts.id })
		.from(signupAttempts)
		.where(and(eq(signupAttempts.ip, ip), gte(signupAttempts.createdAt, since)));
	if (recent.length >= 3) {
		return failure('Too many signups from this network. Please try again later.', 429);
	}
	await db.insert(signupAttempts).values({ ip });

	const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
	if (existing.length) return failure('An account with this email already exists.');

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

	return json({
		status: 'verify',
		email,
		purpose: 'signup',
		devOtp: dev && delivery.channel === 'console' ? delivery.code : null
	});
};
