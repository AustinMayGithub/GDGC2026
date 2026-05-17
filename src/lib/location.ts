// Shared browser-location service.
//
// Every consumer (map zoom, voting, posting) used to cold-start its own
// `getCurrentPosition` call, so each one paid the full provider warm-up cost.
// This module keeps a single `watchPosition` subscription alive: the OS keeps
// the location provider warm, so after the first fix every later read is
// effectively instant. It also caches the last fix (memory + sessionStorage),
// deduplicates concurrent requests, and accepts a coarse server-derived seed
// so the map can render a sensible view before any permission prompt.
//
// Safe to import on client and server - all browser access is guarded.

import { writable, type Readable } from 'svelte/store';

export type GeoSource = 'gps' | 'coarse';

export type GeoFix = {
	lng: number;
	lat: number;
	/** Reported accuracy radius in metres. Coarse (IP) fixes use a large value. */
	accuracyM: number;
	/** epoch ms when the fix was obtained */
	at: number;
	source: GeoSource;
};

export type GeoErrorKind = 'denied' | 'unavailable' | 'timeout' | 'insecure';

/** A location failure with a stable `kind` plus a user-facing message. */
export class GeoError extends Error {
	readonly kind: GeoErrorKind;
	constructor(kind: GeoErrorKind, message: string) {
		super(message);
		this.name = 'GeoError';
		this.kind = kind;
	}
}

export type GeoStatus = 'idle' | 'locating' | 'ready' | 'error';

export type GeoState = {
	fix: GeoFix | null;
	status: GeoStatus;
	error: GeoError | null;
};

const MESSAGES: Record<GeoErrorKind, string> = {
	denied:
		'Location access is blocked. BirdsEye only counts reliability ratings from inside a story’s impact zone - allow location to take part.',
	unavailable: 'This device can’t share a location right now.',
	timeout: 'Couldn’t pin down your location in time - check your connection and try again.',
	insecure: 'Location needs a secure (https) connection.'
};

const SESSION_KEY = 'birdseye:geo-fix';
/** Hard cap on how old a cached GPS fix may be before `getLocation` re-acquires. */
const MAX_AGE_MS = 15 * 60 * 1000;
/** A `watchPosition` reading this fresh may be reused without re-querying. */
const WATCH_FRESH_MS = 2 * 60 * 1000;
/** Default wait for a brand-new cold fix. */
const FIRST_FIX_TIMEOUT_MS = 12_000;

const store = writable<GeoState>({ fix: null, status: 'idle', error: null });

let current: GeoFix | null = null;
let watchId: number | null = null;
let pending: Promise<GeoFix> | null = null;

/** Reactive view of the best-known location, for status indicators. */
export const location: Readable<GeoState> = { subscribe: store.subscribe };

function geoAvailable(): boolean {
	return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

function persist(fix: GeoFix) {
	try {
		sessionStorage.setItem(SESSION_KEY, JSON.stringify(fix));
	} catch {
		// Storage unavailable (private mode / quota) - the in-memory cache still works.
	}
}

function restore(): GeoFix | null {
	try {
		const raw = sessionStorage.getItem(SESSION_KEY);
		if (!raw) return null;
		const fix = JSON.parse(raw) as GeoFix;
		if (typeof fix?.lng === 'number' && typeof fix?.lat === 'number' && fix.source === 'gps') {
			return fix;
		}
	} catch {
		// Ignore malformed cache.
	}
	return null;
}

function setFix(fix: GeoFix) {
	// A coarse seed must never clobber a precise GPS fix.
	if (current && current.source === 'gps' && fix.source === 'coarse') return;
	current = fix;
	if (fix.source === 'gps') persist(fix);
	store.set({ fix, status: 'ready', error: null });
}

function classify(err: GeolocationPositionError): GeoError {
	if (err.code === err.PERMISSION_DENIED) return new GeoError('denied', MESSAGES.denied);
	if (err.code === err.TIMEOUT) return new GeoError('timeout', MESSAGES.timeout);
	return new GeoError('unavailable', MESSAGES.unavailable);
}

function toFix(pos: GeolocationPosition): GeoFix {
	return {
		lng: pos.coords.longitude,
		lat: pos.coords.latitude,
		accuracyM: pos.coords.accuracy ?? 0,
		at: Date.now(),
		source: 'gps'
	};
}

/**
 * Keep a continuous fix so the OS provider stays warm and later reads resolve
 * instantly. Runs at high accuracy: this is the background refinement pass, so
 * latency here is invisible to the user.
 */
function startWatch() {
	if (watchId !== null || !geoAvailable()) return;
	watchId = navigator.geolocation.watchPosition(
		(pos) => setFix(toFix(pos)),
		() => {
			// Transient watch errors are non-fatal - `getLocation` surfaces hard failures.
		},
		{ enableHighAccuracy: true, maximumAge: WATCH_FRESH_MS, timeout: 27_000 }
	);
}

/** Stop the background watch (e.g. on full app teardown). */
export function stopWatch() {
	if (watchId !== null && geoAvailable()) {
		navigator.geolocation.clearWatch(watchId);
		watchId = null;
	}
}

function getCurrentPosition(options: PositionOptions): Promise<GeoFix> {
	return new Promise((resolve, reject) => {
		navigator.geolocation.getCurrentPosition(
			(pos) => resolve(toFix(pos)),
			(err) => reject(classify(err)),
			options
		);
	});
}

export type GetLocationOptions = {
	/** Reuse a cached GPS fix if no older than this (ms). Default 15 min. */
	maxAgeMs?: number;
	/** Acceptable wait for a brand-new fix (ms). Default 12 s. */
	timeoutMs?: number;
};

/**
 * Resolve a precise GPS fix - fast when warm, deduplicated when cold.
 *
 * The cold path requests a *low-accuracy* fix first (wifi/cell positioning,
 * which returns in ~1 s instead of waiting on a GPS lock) and then starts the
 * high-accuracy `watchPosition` to refine in the background. Throws `GeoError`.
 */
export function getLocation(opts: GetLocationOptions = {}): Promise<GeoFix> {
	const maxAge = opts.maxAgeMs ?? MAX_AGE_MS;
	const timeout = opts.timeoutMs ?? FIRST_FIX_TIMEOUT_MS;

	if (!geoAvailable()) {
		return Promise.reject(new GeoError('unavailable', MESSAGES.unavailable));
	}
	if (typeof window !== 'undefined' && window.isSecureContext === false) {
		return Promise.reject(new GeoError('insecure', MESSAGES.insecure));
	}

	// 1. A warm, fresh GPS fix is already in hand.
	if (current && current.source === 'gps' && Date.now() - current.at <= maxAge) {
		startWatch();
		return Promise.resolve(current);
	}

	// 2. A cold acquisition is already in flight - join it rather than stacking
	//    a second permission/provider request.
	if (pending) return pending;

	// 3. Cold acquire.
	store.update((s) => ({ ...s, status: 'locating' }));
	pending = getCurrentPosition({ enableHighAccuracy: false, maximumAge: maxAge, timeout })
		.then((fix) => {
			setFix(fix);
			startWatch();
			return fix;
		})
		.catch((err: GeoError) => {
			store.set({ fix: current, status: 'error', error: err });
			throw err;
		})
		.finally(() => {
			pending = null;
		});
	return pending;
}

/**
 * Begin acquiring location early (e.g. on app mount) so the first vote or post
 * is instant. Never throws - callers that truly need a fix call `getLocation`.
 */
export function prewarm() {
	if (!current) {
		const restored = restore();
		if (restored) {
			current = restored;
			store.set({ fix: restored, status: 'ready', error: null });
		}
	}
	void getLocation().catch(() => {
		// Swallowed - surfaced later if a consumer actually needs the fix.
	});
}

/**
 * Seed a coarse, server-derived (IP) location. Lets the map render a sensible
 * view immediately, with no permission prompt. Ignored once any real fix exists.
 */
export function seedCoarse(lng: number, lat: number) {
	if (current) return;
	const fix: GeoFix = { lng, lat, accuracyM: 50_000, at: Date.now(), source: 'coarse' };
	current = fix;
	store.set({ fix, status: 'ready', error: null });
}

/** Best-known location right now, without triggering a request. */
export function peekLocation(): GeoFix | null {
	return current;
}
