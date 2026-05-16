import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { sessions, users } from './db/schema';
import type { SessionUser } from '$lib/types';

export const SESSION_COOKIE = 'birdseye_session';
export const DEV_OTP_COOKIE = 'birdseye_dev_otp';
export const OTP_CHALLENGE_COOKIE = 'birdseye_otp_challenge';
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

export type OtpChallenge = {
	userId: string;
	purpose: PendingPurpose;
	expiresAt: number;
};

export function createOtpChallenge(userId: string, purpose: PendingPurpose): OtpChallenge {
	return {
		userId,
		purpose,
		expiresAt: Date.now() + 15 * 60 * 1000
	};
}

export function encodeOtpChallenge(challenge: OtpChallenge): string {
	return Buffer.from(JSON.stringify(challenge), 'utf8').toString('base64url');
}

export function parseOtpChallenge(raw: string | undefined): OtpChallenge | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
		if (
			!parsed ||
			typeof parsed.userId !== 'string' ||
			(parsed.purpose !== 'signup' && parsed.purpose !== 'login') ||
			typeof parsed.expiresAt !== 'number'
		) {
			return null;
		}
		if (parsed.expiresAt < Date.now()) return null;
		return parsed satisfies OtpChallenge;
	} catch {
		return null;
	}
}
