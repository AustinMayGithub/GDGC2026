import { json } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { emailOtps, users } from '$lib/server/db/schema';
import {
	createSession,
	DEV_OTP_COOKIE,
	hashOtp,
	normalizeOtp,
	parsePending,
	PENDING_COOKIE,
	SESSION_COOKIE
} from '$lib/server/auth';
import type { RequestHandler } from './$types';

function failure(message: string, status = 400) {
	return json({ message }, { status });
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	const pending = parsePending(cookies.get(PENDING_COOKIE));
	if (!pending) return failure('Your verification session has expired. Please sign in again.', 401);

	const body = await request.json().catch(() => null);
	const code = normalizeOtp(String(body?.code ?? ''));
	if (!/^\d{6}$/.test(code)) return failure('Enter the 6-digit code.');

	const [otp] = await db
		.select()
		.from(emailOtps)
		.where(
			and(
				eq(emailOtps.userId, pending.userId),
				eq(emailOtps.purpose, pending.purpose),
				eq(emailOtps.used, false),
				eq(emailOtps.codeHash, hashOtp(code))
			)
		)
		.orderBy(desc(emailOtps.createdAt))
		.limit(1);

	if (!otp || otp.expiresAt.getTime() < Date.now()) {
		return failure('That code is invalid or has expired.');
	}

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
	if (pending.purpose === 'signup') {
		await db.update(users).set({ emailVerified: true }).where(eq(users.id, pending.userId));
	}

	const { token, expiresAt } = await createSession(pending.userId);
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt
	});
	cookies.delete(PENDING_COOKIE, { path: '/' });
	cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });

	return json({ status: 'signedIn' });
};
