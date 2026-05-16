import { json, error, isHttpError } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { db } from '$lib/server/db';
import { postImages, posts } from '$lib/server/db/schema';
import {
	NZ_REGIONS,
	OUTSIDE_NZ_POST_MESSAGE,
	isWithinNzBounds,
	regionForPoint
} from '$lib/data/nz-regions';
import { listPosts } from '$lib/server/posts';
import { moderateText } from '$lib/server/ai';
import type { RequestHandler } from './$types';

const DEFAULT_LOCATION_EPSILON = 0.000001;
const DEFAULT_JITTER_MIN_M = 250;
const DEFAULT_JITTER_MAX_M = 500;
const METERS_PER_DEGREE_LAT = 111320;
const MAX_POST_IMAGES = 6;
const MAX_IMAGE_BYTES = 1_500_000;

function isMissingOptionalPostColumn(err: unknown) {
	const message = err instanceof Error ? err.message : String(err);
	return (
		(message.includes('anonymous') || message.includes('header_image_data_url')) &&
		message.includes('does not exist')
	);
}

function isMissingPostImagesTable(err: unknown) {
	const message = err instanceof Error ? err.message : String(err);
	return message.includes('post_images') && message.includes('does not exist');
}

function errorMessages(err: unknown, seen = new Set<unknown>()): string[] {
	if (!err || seen.has(err)) return [];
	seen.add(err);

	const parts: string[] = [];
	if (err instanceof Error && err.message) {
		parts.push(err.message);
	} else {
		parts.push(String(err));
	}

	const detail = err as { cause?: unknown; code?: unknown; errors?: unknown[] };
	if (detail.code) parts.push(String(detail.code));
	if (detail.cause) parts.push(...errorMessages(detail.cause, seen));
	if (Array.isArray(detail.errors)) {
		for (const nested of detail.errors) parts.push(...errorMessages(nested, seen));
	}

	return parts;
}

function errorMessage(err: unknown) {
	return errorMessages(err).filter(Boolean).join(' ') || String(err);
}

function databaseFailureMessage(err: unknown, action: string) {
	const message = errorMessage(err).toLowerCase();
	if (
		message.includes('econnrefused') ||
		message.includes('connection terminated') ||
		message.includes('connect econnrefused')
	) {
		return `Could not connect to the database while ${action}. Check that Postgres is running, then try again.`;
	}

	if (
		(message.includes('relation') || message.includes('column') || message.includes('enum')) &&
		(message.includes('does not exist') ||
			message.includes('column') ||
			message.includes('enum') ||
			message.includes('invalid input value'))
	) {
		return 'The database schema is out of date. Run the database migration/push, then try publishing again.';
	}

	return dev
		? `${action[0].toUpperCase()}${action.slice(1)} failed: ${errorMessage(err)}`
		: 'Something went wrong while publishing. Please try again.';
}

function isDefaultRegionLocation(lng: number, lat: number) {
	return NZ_REGIONS.some(
		(region) =>
			Math.abs(region.center[0] - lng) <= DEFAULT_LOCATION_EPSILON &&
			Math.abs(region.center[1] - lat) <= DEFAULT_LOCATION_EPSILON
	);
}

function jitterLocation(lng: number, lat: number) {
	const angle = Math.random() * Math.PI * 2;
	const distanceM =
		DEFAULT_JITTER_MIN_M + Math.random() * (DEFAULT_JITTER_MAX_M - DEFAULT_JITTER_MIN_M);
	const latOffset = (Math.cos(angle) * distanceM) / METERS_PER_DEGREE_LAT;
	const lngMetersPerDegree = METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
	const lngOffset = (Math.sin(angle) * distanceM) / lngMetersPerDegree;

	return {
		lng: lng + lngOffset,
		lat: lat + latOffset
	};
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const scope = url.searchParams.get('scope');
		const regionId = url.searchParams.get('regionId') ?? undefined;
		const list = await listPosts({ regionId: scope === 'local' ? regionId : undefined });
		return json({ posts: list });
	} catch (err) {
		console.error('[api/posts] list posts failed:', err);
		return json({ message: databaseFailureMessage(err, 'loading posts'), posts: [] }, { status: 500 });
	}
};

async function createPost({ request, locals }: Parameters<RequestHandler>[0]) {
	if (!locals.user) throw error(401, 'Sign in to post.');

	const data = await request.json().catch(() => null);
	if (!data) throw error(400, 'Invalid request body.');

	const title = String(data.title ?? '').trim();
	const body = String(data.body ?? '').trim();
	const rawImages = Array.isArray(data.imageDataUrls)
		? data.imageDataUrls
		: Array.isArray(data.images)
			? data.images
			: [];
	const imageDataUrls = rawImages
		.map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
		.filter(Boolean)
		.slice(0, MAX_POST_IMAGES);
	const legacyHeaderImageDataUrl =
		typeof data.headerImageDataUrl === 'string' && data.headerImageDataUrl.trim()
			? data.headerImageDataUrl.trim()
			: null;
	const headerImageDataUrl = imageDataUrls[0] ?? legacyHeaderImageDataUrl;
	const category =
		data.category === 'personal' || data.category === 'factual' ? data.category : null;
	const lng = Number(data.lng);
	const lat = Number(data.lat);
	const impactRadiusM = Math.round(Number(data.impactRadiusM));
	const anonymous = data.anonymous === true;

	if (title.length < 4 || title.length > 140)
		throw error(400, 'Title must be 4–140 characters.');
	if (body.length < 10 || body.length > 5000)
		throw error(400, 'Body must be 10–5000 characters.');
	if (
		imageDataUrls.some(
			(image) => !image.startsWith('data:image/jpeg;base64,') || image.length > MAX_IMAGE_BYTES
		) ||
		(headerImageDataUrl &&
			(!headerImageDataUrl.startsWith('data:image/jpeg;base64,') ||
				headerImageDataUrl.length > MAX_IMAGE_BYTES))
	)
		throw error(400, 'Images must be cropped JPEGs under 1.5 MB each.');
	if (!category) throw error(400, 'Choose a post category.');
	if (!Number.isFinite(lng) || !Number.isFinite(lat))
		throw error(400, 'Pick a location on the map.');
	if (!isWithinNzBounds(lng, lat)) throw error(400, OUTSIDE_NZ_POST_MESSAGE);
	if (!Number.isFinite(impactRadiusM) || impactRadiusM < 100 || impactRadiusM > 300000)
		throw error(400, 'Set an affected location between 100 m and 300 km.');

	const allowed = await moderateText(`${title}\n\n${body}`);
	if (!allowed)
		throw error(422, 'This content was flagged by moderation and cannot be posted.');

	const postLocation = isDefaultRegionLocation(lng, lat) ? jitterLocation(lng, lat) : { lng, lat };

	const baseValues = {
		authorId: locals.user.id,
		title,
		body,
		category,
		lng: postLocation.lng,
		lat: postLocation.lat,
		impactRadiusM,
		regionId: regionForPoint(postLocation.lng, postLocation.lat)
	};

	let post: { id: string } | undefined;
	try {
		[post] = await db
			.insert(posts)
			.values({
				...baseValues,
				headerImageDataUrl,
				anonymous
			})
			.returning({ id: posts.id });
	} catch (err) {
		if (!isMissingOptionalPostColumn(err)) throw err;
		[post] = await db.insert(posts).values(baseValues).returning({ id: posts.id });
	}

	if (!post) throw error(500, 'Post could not be created.');

	if (imageDataUrls.length > 0) {
		try {
			await db.insert(postImages).values(
				imageDataUrls.map((dataUrl, position) => ({
					postId: post!.id,
					dataUrl,
					position
				}))
			);
		} catch (err) {
			if (!isMissingPostImagesTable(err)) throw err;
		}
	}

	return json({ id: post.id }, { status: 201 });
};

export const POST: RequestHandler = async (event) => {
	try {
		return await createPost(event);
	} catch (err) {
		if (isHttpError(err)) {
			return json({ message: err.body.message }, { status: err.status });
		}

		console.error('[api/posts] create post failed:', err);
		return json({ message: databaseFailureMessage(err, 'publishing') }, { status: 500 });
	}
};
