import { json } from '@sveltejs/kit';
import { and, eq, gte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { signupAttempts, users } from '$lib/server/db/schema';
import {
	hashPassword,
	isDisposableEmail,
	createSession,
	SESSION_COOKIE
} from '$lib/server/auth';
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
		.values({ email, displayName, passwordHash: hashPassword(password), emailVerified: true })
		.returning({ id: users.id });

	const { token, expiresAt } = await createSession(user.id);
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt
	});

	return json({ status: 'signedIn' });
};
