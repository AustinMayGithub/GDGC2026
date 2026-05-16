import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { sessions, users } from './db/schema';
import type { SessionUser } from '$lib/types';

export const SESSION_COOKIE = 'birdseye_session';
export const PENDING_COOKIE = 'birdseye_pending';
export const DEV_OTP_COOKIE = 'birdseye_dev_otp';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;

export function hashPassword(password: string): string {
	const salt = randomBytes(16).toString('hex');
	const derived = scryptSync(password, salt, 64).toString('hex');
	return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
	const [salt, derived] = stored.split(':');
	if (!salt || !derived) return false;
	const test = scryptSync(password, salt, 64);
	const original = Buffer.from(derived, 'hex');
	return test.length === original.length && timingSafeEqual(test, original);
}

export function generateOtp(): string {
	return String(Math.floor(100000 + Math.random() * 900000));
}

export function hashOtp(code: string): string {
	return createHash('sha256').update(code.trim()).digest('hex');
}

export function otpExpiry(): Date {
	return new Date(Date.now() + OTP_TTL_MS);
}

export async function createSession(
	userId: string
): Promise<{ token: string; expiresAt: Date }> {
	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
	await db.insert(sessions).values({ id: token, userId, expiresAt });
	return { token, expiresAt };
}

export async function validateSession(token: string): Promise<SessionUser | null> {
	const rows = await db
		.select({
			expiresAt: sessions.expiresAt,
			id: users.id,
			email: users.email,
			displayName: users.displayName,
			emailVerified: users.emailVerified
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, token));

	const row = rows[0];
	if (!row) return null;
	if (row.expiresAt.getTime() < Date.now()) {
		await db.delete(sessions).where(eq(sessions.id, token));
		return null;
	}
	return {
		id: row.id,
		email: row.email,
		displayName: row.displayName,
		emailVerified: row.emailVerified
	};
}

export async function deleteSession(token: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, token));
}

export type PendingPurpose = 'signup' | 'login';

export function encodePending(userId: string, purpose: PendingPurpose): string {
	return `${userId}:${purpose}`;
}

export function parsePending(
	raw: string | undefined
): { userId: string; purpose: PendingPurpose } | null {
	if (!raw) return null;
	const [userId, purpose] = raw.split(':');
	if (!userId || (purpose !== 'signup' && purpose !== 'login')) return null;
	return { userId, purpose };
}
