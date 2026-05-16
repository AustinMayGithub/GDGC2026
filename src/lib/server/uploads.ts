import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

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

export async function savePostHeaderImage(file: File): Promise<string> {
	if (!ALLOWED_HEADER_IMAGE_TYPES.has(file.type)) {
		throw new Error('Header image must be a JPEG, PNG, or WebP image.');
	}

	if (file.size <= 0 || file.size > MAX_HEADER_IMAGE_BYTES) {
		throw new Error('Header image must be under 1.5 MB.');
	}

	await mkdir(HEADER_DIR, { recursive: true });

	const extension = EXTENSIONS_BY_TYPE[file.type] ?? extname(file.name).toLowerCase();
	const filename = `${randomUUID()}${extension}`;
	const bytes = new Uint8Array(await file.arrayBuffer());
	await writeFile(join(HEADER_DIR, filename), bytes);

	return `${HEADER_URL_PREFIX}${filename}`;
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
