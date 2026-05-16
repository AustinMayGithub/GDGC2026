# AI Image Captioning, Alt-Text & Visual Moderation

**Domain:** AI & content intelligence
**Complexity:** L
**Status:** Proposed

## Summary
Posts can carry a header image (`posts.headerImageDataUrl`, `schema.ts:68`), but today it is never described and never moderated — only post *text* passes through moderation (`api/posts/+server.ts:86`). Add a vision pass on upload that (1) generates accessible alt-text, (2) produces a short neutral caption, and (3) runs the image through OpenAI's multimodal moderation so an unsafe image cannot go live.

## Why it fits BirdsEye
project.md §4.7 makes moderation a hard MVP requirement and frames a bystander posting harmful content as "a demo-ending failure" — but the current write path only moderates the text/title concatenation (`api/posts/+server.ts:86`), leaving the header image a moderation hole. Closing it is squarely §4.7 work. Alt-text is a basic accessibility duty for a public news platform. It respects §4.5 fully: the caption describes *what is visibly in the image*, neutrally, and explicitly does not assess whether the image proves or supports the post's claim — it is description, not corroboration.

## User value
- Screen-reader users get real alt-text instead of a missing/empty image.
- A neutral caption gives quick context in feeds/previews.
- Unsafe images are blocked before publication — the §4.7 safety floor finally covers visuals.

## Data model changes
Add to `posts` (`schema.ts:59`):
```ts
imageAltText: text('image_alt_text'),   // AI-generated, null if no image / no API key
imageCaption: text('image_caption')     // short neutral caption | null
```
Both nullable. Follows the existing `isMissingOptionalPostColumn` tolerance pattern (`posts.ts:46`, `api/posts/+server.ts:14`) for additive columns.

## API / server changes
- `src/lib/server/ai.ts` — two new functions:
  - `moderateImage(dataUrl): Promise<boolean>` — calls `client.moderations.create` with `model: 'omni-moderation-latest'` and an `image_url` input (the moderation endpoint accepts images). Mirrors `moderateText` (`ai.ts:33`): returns `true` (allowed) on API failure / no key, free to call.
  - `describeImage(dataUrl): Promise<{ altText: string; caption: string } | null>` — a `gpt-4o-mini` vision call (the model accepts image inputs), `max_tokens: 120`, `temperature: 0.2`, strict JSON output. System prompt: "Describe only what is visibly present. Alt-text: concise, factual, for screen readers. Caption: one neutral sentence. Do NOT speculate, do NOT state whether the image proves or relates to any claim, do NOT judge truth." This mirrors the §4.5 discipline of the note prompt (`ai.ts:12-21`).
  - Cost: vision call ~$0.001-0.003 per image; one call per upload — acceptable.
- `src/routes/api/posts/+server.ts` `POST` (line 51): when `headerImageDataUrl` is present (already validated as a cropped JPEG <1.5MB at lines 74-79):
  1. `await moderateImage(headerImageDataUrl)` — if false, `throw error(422, ...)` exactly like the text moderation block at line 87. This is a *blocking* gate (safety).
  2. `await describeImage(...)` — non-blocking-tolerant; on `null`, store with null alt/caption. The post insert (line 105) includes the two new columns.
  - The existing `isMissingOptionalPostColumn` try/fallback (lines 104-116) must be extended so the fallback insert also tolerates the new columns being absent.
- `src/routes/api/posts/[id]/image/+server.ts`: no logic change, but the image is now known-moderated.
- Failure fallback: image moderation API error → allow (dev-mode parity with `ai.ts:43`); description failure → null alt/caption, post still publishes.

## UI / component changes
- `src/lib/components/HeaderImageCropper.svelte` (`compose/+page.svelte:148`): optionally show "Checking image…" while the post submits — minor; the real work is server-side.
- Article view (`src/routes/post/[id]/+page.svelte`): render the header `<img>` with `alt={post.imageAltText}` instead of an empty/missing alt; optionally show `imageCaption` as a `<figcaption>`.
- Headline/feed components that show `hasImage` (`PostSummary.hasImage`, `posts.ts:69`) can use alt-text for thumbnails.
- `src/lib/types.ts`: add `imageAltText` and `imageCaption` to `PostDetail` (line 58); thread them through `getPostDetail` (`posts.ts:206`).

## Dependencies & risks
- No new npm dependencies — OpenAI SDK already imported (`ai.ts:25`) and supports vision + image moderation.
- Risk: data-URL JPEGs up to 1.5MB sent to the API — acceptable; already size-capped at compose (`api/posts/+server.ts:77`).
- Risk: added latency on post submit (two vision calls). Mitigate — only runs when an image is attached; run moderation and description concurrently with `Promise.all`; show a submitting state.
- Risk: caption misread as endorsement. Mitigate via the prompt rule and neutral `<figcaption>` framing.
- Risk: image moderation endpoint API shape — verify the OpenAI moderation endpoint's current image-input support during the §11 hour 0-6 block.

## Implementation steps
1. Add `imageAltText` + `imageCaption` columns to `posts` in `schema.ts`; generate a migration.
2. Add `moderateImage` and `describeImage` to `src/lib/server/ai.ts`.
3. In `api/posts/+server.ts` `POST`, gate on `moderateImage` (blocking) and enrich with `describeImage` (tolerant); extend the missing-column fallback insert.
4. Thread `imageAltText`/`imageCaption` through `getPostDetail` and the `PostDetail` type.
5. Render real `alt` + optional `<figcaption>` on the article view.
6. Verify a flagged image is rejected with 422 and a clean image publishes with alt-text.

## Testing & verification
- Unit: `moderateImage` returns `true` with no API key; `describeImage` returns `null` on failure.
- Manual: post with a benign image → alt-text + caption populated, image renders with `alt`. Post with an unsafe image → 422, post not created.
- Accessibility check: header image exposes meaningful alt-text to a screen reader.
- Confirm posts without images are unaffected and the missing-column fallback still works.

## Out of scope / future
- Moderating images embedded in comments (comments have no images today).
- OCR of text within images.
- Re-moderating images on edit (posts aren't editable per §12).
- User override / manual alt-text entry (could be a fast follow).
