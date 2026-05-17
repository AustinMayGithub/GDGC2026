import type { SessionUser } from '$lib/types';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
			/** Coarse, IP-derived location from CDN geo headers - null when unavailable. */
			coarseLocation: { lng: number; lat: number } | null;
		}
	}
}

export {};
