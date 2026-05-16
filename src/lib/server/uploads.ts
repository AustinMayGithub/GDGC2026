import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR ?? 'data/uploads');
const HEADER_DIR = join(UPLOAD_ROOT, 'post-headers');
const HEADER_URL_PREFIX = '/uploads/post-headers/';
const MAX_HEADER_IMAGE_BYTES = 1_500_000;
const ALLOWED_HEADER_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const EXTENSIONS_BY_TYPE: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp'
};

export function isValidPostHeaderImageUrl(value: string): boolean {
	return value.startsWith(HEADER_URL_PREFIX) && !value.includes('..') && !value.includes('\\');
}

export async function savePostHeaderImage(file: File, postId: string): Promise<string> {
	if (!/^[a-f0-9-]{36}$/i.test(postId)) {
		throw new Error('Post ID is invalid.');
	}

	if (!ALLOWED_HEADER_IMAGE_TYPES.has(file.type)) {
		throw new Error('Header image must be a JPEG, PNG, or WebP image.');
	}

	if (file.size <= 0 || file.size > MAX_HEADER_IMAGE_BYTES) {
		throw new Error('Header image must be under 1.5 MB.');
	}

	await mkdir(HEADER_DIR, { recursive: true });

	const extension = EXTENSIONS_BY_TYPE[file.type] ?? extname(file.name).toLowerCase();
	await Promise.all(
		Object.values(EXTENSIONS_BY_TYPE).map((ext) =>
			unlink(join(HEADER_DIR, `${postId}${ext}`)).catch(() => undefined)
		)
	);

	const filename = `${postId}${extension}`;
	const bytes = new Uint8Array(await file.arrayBuffer());
	await writeFile(join(HEADER_DIR, filename), bytes);

	return `${HEADER_URL_PREFIX}${filename}`;
}

export async function getPostHeaderImageUrl(postId: string): Promise<string | null> {
	if (!/^[a-f0-9-]{36}$/i.test(postId)) return null;

	for (const extension of Object.values(EXTENSIONS_BY_TYPE)) {
		const filename = `${postId}${extension}`;
		const path = join(HEADER_DIR, filename);
		if (!resolve(path).startsWith(resolve(HEADER_DIR))) continue;

		try {
			await access(path);
			return `${HEADER_URL_PREFIX}${filename}`;
		} catch {
			// Try the next supported extension.
		}
	}

	return null;
}

export async function readPostHeaderImage(filename: string): Promise<{
	bytes: Uint8Array;
	contentType: string;
} | null> {
	if (!/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(filename)) return null;

	const path = join(HEADER_DIR, filename);
	if (!resolve(path).startsWith(resolve(HEADER_DIR))) return null;

	try {
		const bytes = await readFile(path);
		const ext = extname(filename).toLowerCase();
		const contentType =
			ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
		return { bytes, contentType };
	} catch {
		return null;
	}
}
