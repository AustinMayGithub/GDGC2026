# OG Share Cards + Weekly Email Digest

**Domain:** Social, engagement & notifications
**Complexity:** XL
**Status:** Proposed

## Summary
Two linked growth/retention features sharing one rendering pipeline:
1. **OG share cards** — every post gets a dynamically generated 1200×630 social
   preview image (title, region, category, credibility meter) so links pasted
   into messaging apps and social media look like real news.
2. **Weekly email digest** — a per-user opt-in email summarising the top posts
   in their followed regions over the past week, sent via Resend.

Both render the same visual "post card" — once as a PNG for OG tags, once as
HTML inside the digest email.

## Why it fits BirdsEye
project.md §1 frames BirdsEye as "part news site" and a "control room" for
NZ news. A news platform that produces bare, unfurled links squanders every
share. OG cards make BirdsEye links carry the credibility meter (§4.4) and the
location into the share itself — the platform's signature signals travel with
the link. The digest is the asynchronous half of the notification system (§9
"follow a region", §10 nice-to-have): not everyone will return daily, so a
weekly pull is the retention backstop. Resend is already wired and proven for
OTP delivery (`email.ts`), and the digest reuses the `regionFollows` table from
the follow/notifications feature.

## User value
- Shared BirdsEye links look trustworthy and informative in chats / feeds.
- Drives new visitors from every share — organic growth in a demo and beyond.
- The digest brings lapsed users back with a low-effort weekly summary of their
  regions, including credibility meters and comment counts.

## Data model changes
Add a digest preference + a send log. Extend `users` in
`src/lib/server/db/schema.ts`:

```ts
// add to users table:
digestOptIn: boolean('digest_opt_in').notNull().default(false),
```
New table to avoid double-sends and record history:

```ts
export const digestSends = pgTable(
	'digest_sends',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
		postCount: integer('post_count').notNull()
	},
	(t) => ({ byUser: index('digest_user').on(t.userId, t.sentAt) })
);
```
OG cards need **no** schema change — they are derived from existing post data.

## API / server changes
- New `src/routes/api/posts/[id]/og/+server.ts` — `GET` returns a `image/png`
  response. Renders the post's title, region name (`getRegion` from
  `nz-regions`), category badge, and credibility meter (`verifyCount` /
  `disputeCount` from `getPostDetail`, `posts.ts:236-241`). Use `@vercel/og` /
  `satori` + `resvg` to turn JSX/HTML into a PNG. Cache with a long
  `Cache-Control` header keyed off the post id.
- New `src/routes/post/[id]/+page.ts` (or extend `+page.server.ts`) — inject
  `<meta property="og:image">`, `og:title`, `og:description`, and Twitter-card
  tags pointing at the `/og` endpoint, via `<svelte:head>` in
  `post/[id]/+page.svelte` (currently only sets `<title>`, `+page.svelte:77-79`).
- New `src/lib/server/digest.ts`:
  - `buildDigestFor(userId)` — read `regionFollows` for the user, select the
    week's top posts per region using the same ranking math as the home page
    (`popularityScore`, `+page.svelte:231-242`) lifted into a shared module.
  - `renderDigestHtml(posts)` — HTML email body reusing the post-card layout.
  - `sendDigests()` — iterate opted-in users, skip anyone with a `digest_sends`
    row in the last 6 days, send via Resend, log a `digest_sends` row.
- `src/lib/server/email.ts` — add a `sendDigestEmail(to, html)` function beside
  `sendOtpEmail` (`email.ts:10-45`), reusing the Resend client + the
  no-API-key console fallback.
- New `src/routes/api/cron/digest/+server.ts` — a `POST` endpoint guarded by a
  shared secret header that calls `sendDigests()`; triggered by an external
  scheduler (or run manually for the demo). No in-app cron daemon needed.
- `src/routes/api/users/me/+server.ts` `PATCH` (`me/+server.ts:9-47`) — accept
  and validate a `digestOptIn` boolean and persist it via `updateUserProfile`
  (`users.ts:210-231`).

## UI / component changes
- New `src/lib/components/PostCard.svelte` — the shared visual card (title,
  region, category, mini credibility bar). Used by the OG renderer (as
  Satori-compatible markup) and conceptually mirrored in the digest HTML.
- `src/routes/post/[id]/+page.svelte` — add OG/Twitter `<meta>` tags to
  `<svelte:head>`; add a "Share" button to `.post-actions`
  (`+page.svelte:126-132`) that copies the post URL (the OG card unfurls
  automatically wherever it is pasted).
- `src/routes/profile/[id]/+page.svelte` — on the user's own profile, add a
  "Weekly digest" toggle in the Account section (`+page.svelte:365-375`),
  PATCHing `digestOptIn` like the existing profile edit flow
  (`+page.svelte:47-75`).
- `src/lib/types.ts` — add `digestOptIn` to `UserProfile`.

## Dependencies & risks
- New packages: `satori` + `@resvg/resvg-js` (or `@vercel/og`) for HTML→PNG.
  This is the main risk — image rendering needs a bundled font and works
  differently under the Node adapter; spike it early. **Fallback:** ship a
  single static OG image for all posts (still better than no card) if dynamic
  rendering is shaky — decide by the §11 hour-6 gate logic.
- Depends on the `regionFollows` table from the follow/notifications feature for
  the digest; OG cards are independent and can ship alone.
- Resend free-tier sending limits — fine for a demo; note for scale.
- Digest must be idempotent: the `digest_sends` 6-day check prevents
  double-sends if the cron endpoint is hit twice.
- Email HTML must be inline-styled and table-based for client compatibility —
  do not reuse `app.css`.
- The OG endpoint must not leak anonymous authors — show "Anonymous" exactly as
  `listPosts` does (`posts.ts:201-203`).

## Implementation steps
1. Spike `satori` + `resvg` rendering a PNG under the Node adapter with a
   bundled font; confirm before committing to dynamic cards.
2. Build `PostCard.svelte` as the shared card layout.
3. Create `api/posts/[id]/og/+server.ts` returning the PNG.
4. Add OG/Twitter `<meta>` tags + a Share button to `/post/[id]`.
5. Add `digestOptIn` to the `users` table and `digest_sends` table; migrate.
6. Lift `popularityScore` ranking into a shared `src/lib/ranking.ts` so the
   home page and digest agree.
7. Write `src/lib/server/digest.ts` (build, render, send).
8. Add `sendDigestEmail` to `email.ts`.
9. Create the secret-guarded `api/cron/digest` endpoint.
10. Add `digestOptIn` handling to the `users/me` PATCH and a profile toggle.
11. Configure an external scheduler (or document the manual trigger for the
    demo).

## Testing & verification
- Visit `/api/posts/{id}/og` — a correct 1200×630 PNG renders with title,
  region, and credibility meter; anonymous posts show "Anonymous".
- Paste a `/post/{id}` link into a link-preview validator — card unfurls.
- Opt into the digest, follow regions, seed week-old posts, hit the cron
  endpoint — a digest email sends (or logs to console with no Resend key).
- Hitting the cron endpoint twice does not double-send (the `digest_sends`
  guard holds).
- Opted-out users receive nothing.
- The cron endpoint rejects requests without the shared secret (401/403).

## Out of scope / future
- Per-post "share to X / Facebook" intent buttons.
- Daily / configurable digest frequency.
- Personalised digest ML ranking.
- Push notifications.
