import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import type { PendingPurpose } from './auth';

export type OtpDeliveryResult = { channel: 'email' } | { channel: 'console'; code: string };

/**
 * Sends an OTP code. With no RESEND_API_KEY configured the code is logged to
 * the server console instead - keeps signup/login working in local dev.
 */
export async function sendOtpEmail(
	to: string,
	code: string,
	purpose: PendingPurpose
): Promise<OtpDeliveryResult> {
	const subject =
		purpose === 'signup' ? 'Verify your BirdsEye account' : 'Your BirdsEye login code';
	const intro =
		purpose === 'signup'
			? 'Welcome to BirdsEye. Use this code to verify your email address:'
			: 'Use this code to finish signing in:';

	if (!env.RESEND_API_KEY) {
		if (!dev) {
			throw new Error('Email delivery is not configured.');
		}
		console.log(`\n  [BirdsEye OTP ${purpose}]`);
		console.log(`  to:   ${to}`);
		console.log(`  code: ${code}\n`);
		return { channel: 'console', code };
	}

	try {
		const { Resend } = await import('resend');
		const resend = new Resend(env.RESEND_API_KEY);
		const result = await resend.emails.send({
			from: env.EMAIL_FROM ?? 'BirdsEye <onboarding@resend.dev>',
			to,
			subject,
			text: `${intro}\n\n    ${code}\n\nThis code expires in 10 minutes.\nIf you didn't request it, you can ignore this email.`
		});
		if (result.error) throw new Error(result.error.message);
		return { channel: 'email' };
	} catch (err) {
		if (dev) {
			console.error('[email] failed to send OTP, falling back to console:', err);
			console.log(`[BirdsEye OTP] ${purpose} code for ${to}: ${code}`);
			return { channel: 'console', code };
		}
		throw err;
	}
}
