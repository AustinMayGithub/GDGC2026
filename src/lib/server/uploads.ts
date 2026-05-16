import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR ?? 'data/uploads');
const PHOTO_DIR = join(UPLOAD_ROOT, 'post-photos');
const PHOTO_URL_PREFIX = '/uploads/post-photos/';
const MAX_PHOTO_BYTES = 1_500_000;
const MAX_PHOTOS_PER_POST = 10;
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg']);

function isValidPostId(postId: string): boolean {
	return /^[a-f0-9-]{36}$/i.test(postId);
}

export async function savePostPhotos(files: File[], postId: string): Promise<string[]> {
	if (!isValidPostId(postId)) {
		throw new Error('Post ID is invalid.');
	}
	if (files.length > MAX_PHOTOS_PER_POST) {
		throw new Error(`Posts can include up to ${MAX_PHOTOS_PER_POST} photos.`);
	}
	if (files.length === 0) return [];

	for (const file of files) {
		if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
			throw new Error('Photos must be uploaded as cropped JPEG images.');
		}
		if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
			throw new Error('Each photo must be under 1.5 MB.');
		}
	}

	await mkdir(PHOTO_DIR, { recursive: true });
	await Promise.all(
		Array.from({ length: MAX_PHOTOS_PER_POST }, (_, index) =>
			unlink(join(PHOTO_DIR, `${postId}-${index + 1}.jpg`)).catch(() => undefined)
		)
	);

	const urls: string[] = [];
	for (const [index, file] of files.entries()) {
		const filename = `${postId}-${index + 1}.jpg`;
		const bytes = new Uint8Array(await file.arrayBuffer());
		await writeFile(join(PHOTO_DIR, filename), bytes);
		urls.push(`${PHOTO_URL_PREFIX}${filename}`);
	}

	return urls;
}

export async function getPostPhotoUrls(postId: string): Promise<string[]> {
	if (!isValidPostId(postId)) return [];

	const urls: string[] = [];
	for (let index = 1; index <= MAX_PHOTOS_PER_POST; index++) {
		const filename = `${postId}-${index}.jpg`;
		const path = join(PHOTO_DIR, filename);
		if (!resolve(path).startsWith(resolve(PHOTO_DIR))) continue;

		try {
			await access(path);
			urls.push(`${PHOTO_URL_PREFIX}${filename}`);
		} catch {
			break;
		}
	}

	return urls;
}

export async function readPostPhoto(filename: string): Promise<{
	bytes: Uint8Array;
	contentType: string;
} | null> {
	if (!/^[a-f0-9-]{36}-(?:[1-9]|10)\.jpg$/i.test(filename)) return null;

	const path = join(PHOTO_DIR, filename);
	if (!resolve(path).startsWith(resolve(PHOTO_DIR))) return null;

	try {
		const bytes = await readFile(path);
		return { bytes, contentType: 'image/jpeg' };
	} catch {
		return null;
	}
}
