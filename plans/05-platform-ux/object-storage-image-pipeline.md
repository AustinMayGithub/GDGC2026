# Image-upload Pipeline - Object Storage Instead of Data URLs

**Domain:** Performance, infrastructure, accessibility & UX
**Complexity:** L
**Status:** Proposed

## Summary
Post header images and user avatars are stored as base64 **data URLs in
Postgres** - `posts.headerImageDataUrl` (`schema.ts:68`) and
`users.avatarDataUrl` (`schema.ts:27`). The post endpoint caps the data URL at
1.5 MB (`api/posts/+server.ts:76-79`) and re-decodes it on every image request
(`api/posts/[id]/image/+server.ts`). Base64 inflates storage ~33%, bloats every
`SELECT *`, and the cropper emits the whole image in the JSON post body. Replace
this with a proper upload pipeline: store binary objects (filesystem volume or
S3-compatible bucket) and keep only a key/URL in the DB.

## Why it fits BirdsEye
project.md §10 nice-to-haves include Docker Compose deployment; §5 uses
`adapter-node`. Embedding megabytes of base64 in row data fights every list
query (`listPosts` already works around it with the `hasImage` SQL flag,
`posts.ts:69`) and the defensive missing-column `try/catch`. A clean blob
pipeline removes a real scaling/perf liability and is the "infrastructure"
improvement the domain calls for, while staying within the Docker Compose
deployment model.

## User value
- Faster post-list and post-detail queries (no megabyte payloads in rows).
- Images are cacheable as real static files with proper `ETag`/`Cache-Control`.
- Smaller `POST /api/posts` request bodies - the compose flow stops shipping a
  base64 blob inside JSON (`+page.svelte:585`).

## Data model changes
In `src/lib/server/db/schema.ts`:
- `posts`: replace `headerImageDataUrl: text(...)` with
  `headerImageKey: text('header_image_key')` (nullable).
- `users`: replace `avatarDataUrl: text(...)` with
  `avatarKey: text('avatar_key')` (nullable).

Keep the old columns during migration for a transition window, or write a
one-off backfill script that decodes existing data URLs into the store and
populates the new keys. `npm run db:push` applies the schema; a backfill is a
`tsx` script alongside `src/lib/server/seed.ts`.

## API / server changes
- New module `src/lib/server/storage.ts` - a small abstraction with
  `put(key, buffer, contentType)`, `get(key)`, `delete(key)`. Two backends
  behind one interface:
  - Local: write to a Docker volume path (e.g. `/data/uploads`), keyed by UUID.
  - S3-compatible: use the AWS SDK / `@aws-sdk/client-s3` against MinIO or any
    bucket. Chosen via an env var (`STORAGE_DRIVER`).
- New endpoint `POST /api/uploads` - accepts a multipart image, runs the same
  validation as `HeaderImageCropper` (type, size), stores the object, returns
  `{ key }`. Gate to authenticated users (`locals.user`).
- `src/routes/api/posts/+server.ts` (`POST`) - accept `headerImageKey` instead
  of `headerImageDataUrl`; drop the 1.5 MB base64 check and the
  `isMissingOptionalPostColumn` fallback once migrated.
- `src/routes/api/posts/[id]/image/+server.ts` - stream the object from
  storage instead of decoding base64; keep the existing
  `Cache-Control: immutable` header.
- `src/routes/api/users/[id]/avatar/+server.ts` - same change.
- `docker-compose.yml` - add an `uploads` volume mounted into `web` (local
  driver) or a `minio` service (S3 driver). Add `STORAGE_DRIVER` /
  bucket env vars; mirror them in `.env.example`.

## UI / component changes
- `src/lib/components/HeaderImageCropper.svelte` - `renderCrop()` currently
  calls `canvas.toDataURL(...)` (line 104). Switch to `canvas.toBlob(...)`,
  upload the blob to `POST /api/uploads`, and emit a `key` instead of a data
  URL via `onimagechange`.
- `src/routes/+page.svelte` - `composeHeaderImageDataUrl` (line 101) becomes
  `composeHeaderImageKey`; the submit payload (line 585) sends `headerImageKey`.
  The article view `<img src={post.headerImageDataUrl}>` (line 836) switches to
  the existing `/api/posts/[id]/image` route, which now streams from storage.
- Avatar upload UI (wherever `users.avatarDataUrl` is set) - same blob+key flow.

## Dependencies & risks
- Local driver: no new dependency. S3 driver: `@aws-sdk/client-s3` (or
  `minio`). Pick local-volume for the 48h build to avoid a new service.
- Risk: backfill of existing data-URL rows - write and test the script before
  dropping the old columns.
- Risk: storage volume not persisted - ensure the Docker volume is declared
  (mirrors the existing `db-data` volume pattern in `docker-compose.yml`).
- Risk: orphaned objects when a post is deleted - delete the object in the
  post-delete path (see the post edit/delete plan).

## Implementation steps
1. Add `storage.ts` with the local-filesystem driver and the interface.
2. Add the `POST /api/uploads` endpoint with auth + validation.
3. Add `headerImageKey` / `avatarKey` columns; `npm run db:push`.
4. Update `HeaderImageCropper.svelte` to `toBlob` + upload, emitting a key.
5. Update post create endpoint and `+page.svelte` compose flow to use keys.
6. Update `[id]/image` and `[id]/avatar` GET endpoints to stream from storage.
7. Add the `uploads` volume to `docker-compose.yml` and env vars to
   `.env.example`.
8. Write + run a backfill script; once verified, drop the old `*DataUrl`
   columns and the `isMissingOptionalPostColumn` fallbacks.

## Testing & verification
- Upload a header image, create a post, confirm it renders via
  `/api/posts/[id]/image` and the response has caching headers.
- Confirm `listPosts` rows no longer carry image bytes (inspect payload size).
- Restart the `web` container; confirm images persist (volume) .
- Run the backfill against seeded data; confirm parity.
- `npm run check` passes.

## Out of scope / future
- Image resizing / responsive variants / WebP transcoding on the server.
- CDN in front of object storage.
- Signed/expiring URLs for private images.
