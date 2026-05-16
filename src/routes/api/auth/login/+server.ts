import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import {
	createSession,
	SESSION_COOKIE,
	verifyPassword
} from '$lib/server/auth';
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
		await db
			.update(users)
			.set({ emailVerified: true, loginOtpEnabled: false })
			.where(eq(users.id, user.id));
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
