import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { emailOtps, users } from '$lib/server/db/schema';
import {
	DEV_OTP_COOKIE,
	generateOtp,
	hashOtp,
	otpExpiry,
	parsePending,
	PENDING_COOKIE
} from '$lib/server/auth';
import { sendOtpEmail } from '$lib/server/email';
import type { RequestHandler } from './$types';

function failure(message: string, status = 400) {
	return json({ message }, { status });
}

export const POST: RequestHandler = async ({ cookies }) => {
	const pending = parsePending(cookies.get(PENDING_COOKIE));
	if (!pending) return failure('Your verification session has expired. Please sign in again.', 401);

	const [user] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, pending.userId));
	if (!user) return failure('Your verification session has expired. Please sign in again.', 401);

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
		return json({ status: 'resent', devOtp: delivery.code });
	}
	cookies.delete(DEV_OTP_COOKIE, { path: '/auth/verify' });
	return json({ status: 'resent' });
};
