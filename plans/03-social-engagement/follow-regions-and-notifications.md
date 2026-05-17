# Follow a Region + In-App Notifications

**Domain:** Social, engagement & notifications
**Complexity:** L
**Status:** Proposed

## Summary
Let users follow one or more of New Zealand's 16 regions, and give every user an
in-app notification centre. Notifications fire when a new post lands in a
followed region, when someone comments on the user's post, and when the AI
community note on the user's post is (re)generated. A bell icon in the header
shows an unread count and opens a dropdown.

## Why it fits BirdsEye
"Follow a region" is named directly in project.md §9 ("Ideas worth adding -
**Follow a region**: get posts from places you care about"). The platform is
built on the premise that *news has a location* (§1) and posts already carry a
`regionId` (`schema.ts:73`) drawn from the 16 council boundaries (§8). In-app
notifications are the delivery mechanism that makes following meaningful, and
§10 lists user-facing engagement as the nice-to-have/stretch tier. The
notification events reuse signals the app already computes - new posts
(`api/posts/+server.ts:51`), new comments (`comments/+server.ts:30`), and note
regeneration (`ai.ts:111`).

## User value
- Stay on top of your suburb / region without watching the map.
- Post authors learn when their story gets a comment or an updated AI note.
- An unread badge gives a concrete reason to return - the core retention loop.

## Data model changes
Two new tables in `src/lib/server/db/schema.ts`:

```ts
export const notificationType = pgEnum('notification_type', [
	'region_post', 'post_comment', 'note_updated'
]);

export const regionFollows = pgTable(
	'region_follows',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		regionId: text('region_id').notNull(), // matches posts.regionId / nz-regions ids
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ uniqueFollow: unique('uniq_user_region').on(t.userId, t.regionId) })
);

export const notifications = pgTable(
	'notifications',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		type: notificationType('type').notNull(),
		postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
		actorName: text('actor_name'),       // denormalised display name for display
		body: text('body').notNull(),         // pre-rendered summary line
		readAt: timestamp('read_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ byUser: index('notif_user').on(t.userId, t.createdAt) })
);
```

## API / server changes
- New `src/lib/server/notifications.ts`:
  - `notify(userId, type, { postId, actorName, body })` - single insert; never
    throws (wrap like `maybeRegenerateNote`, `ai.ts:87-134`).
  - `notifyRegionFollowers(regionId, post)` - select `regionFollows.userId` for
    the region, exclude the author, batch-insert one `region_post` row each.
  - `listNotifications(userId, limit)` and `unreadCount(userId)`.
  - `markRead(userId, ids?)` - set `readAt` for given ids or all.
- `src/routes/api/posts/+server.ts` `POST` (after the insert, `+server.ts:115`):
  call `notifyRegionFollowers(post.regionId, ...)` - skip if `anonymous`.
- `src/routes/api/posts/[id]/comments/+server.ts` `POST`
  (after insert, `+server.ts:33`): `notify(post.authorId, 'post_comment', ...)`
  - skip when the commenter is the author. Add an `authorId` field to the
  `post` select at `comments/+server.ts:21-24`.
- `src/lib/server/ai.ts` `maybeRegenerateNote` (after upsert, `ai.ts:111`):
  `notify(post.authorId, 'note_updated', ...)`. Add `authorId` to the post
  select at `ai.ts:89-92`.
- New `src/routes/api/notifications/+server.ts` - `GET` returns the list +
  unread count; `POST` marks read (`{ ids? }`).
- New `src/routes/api/regions/[id]/follow/+server.ts` - `POST` toggles a
  `regionFollows` row (insert/delete-on-conflict, the `react/+server.ts:28-32`
  pattern). Returns `{ following: boolean }`.
- `src/routes/+layout.server.ts` (`+layout.server.ts:3-5`) - also return
  `unreadNotifications: locals.user ? await unreadCount(...) : 0` so the bell
  badge renders on first paint.

## UI / component changes
- `src/lib/types.ts` - add a `NotificationItem` interface
  (`id, type, body, postId, actorName, createdAt, read`).
- New `src/lib/components/NotificationBell.svelte` - a bell button with an
  unread badge; opens a dropdown listing notifications (relative time via the
  `relativeTime` helper pattern in `CommentThread.svelte:27-36`); clicking an
  item navigates to `/post/{postId}` and marks it read; a "Mark all read"
  action. Polls `GET /api/notifications` every ~30s while open (no WebSockets,
  per §10).
- `src/lib/components/UserMenu.svelte` - render `<NotificationBell>` beside the
  avatar (the menu is the shared header element used across `+page.svelte`,
  `post/[id]`, and `profile/[id]`).
- New `src/lib/components/FollowRegionButton.svelte` - a follow/unfollow toggle.
- `src/routes/+page.svelte` - show `<FollowRegionButton>` in the Local-mode
  `.region-controls` block (`+page.svelte:699-713`) for the currently selected
  region.
- `src/routes/profile/[id]/+page.svelte` - on the user's own profile, add a
  "Followed regions" section listing follows with unfollow controls; region
  names via `getRegion` (already imported, `+page.svelte:5`).

## Dependencies & risks
- No new packages - polling, not WebSockets (§10 explicitly rejects real-time).
- Risk: a hot region could fan out many notification rows per post. Acceptable
  at hackathon scale (16 regions, demo-sized user base); batch the insert in one
  statement. Note as a future concern.
- Risk: notification writes must never block the originating request - all
  `notify*` calls are fire-and-forget with internal try/catch, mirroring
  `ai.ts`'s "safe to call, never throws" contract.
- Anonymous posts (`posts.anonymous`, `schema.ts:74`) must not leak an author
  name into a `region_post` notification - use a neutral body string.
- All new tables need the graceful "column/table does not exist" tolerance the
  codebase already uses (`users.ts:31-44`) if migrations lag.

## Implementation steps
1. Add `notificationType`, `regionFollows`, `notifications` to `schema.ts`;
   generate + run migration.
2. Add `NotificationItem` to `types.ts`.
3. Write `src/lib/server/notifications.ts` (notify, fan-out, list, count,
   markRead).
4. Create the `notifications` and `regions/[id]/follow` API routes.
5. Hook `notify*` calls into the post-create, comment-create, and
   note-regeneration paths.
6. Return `unreadNotifications` from `+layout.server.ts`.
7. Build `NotificationBell.svelte` and mount it via `UserMenu.svelte`.
8. Build `FollowRegionButton.svelte`; wire it into the home Local controls.
9. Add the "Followed regions" section to the profile page.

## Testing & verification
- Follow Wellington; another account posts in Wellington → a `region_post`
  notification appears; the bell badge increments.
- Comment on someone's post → the author gets a `post_comment` notification;
  commenting on your own post produces none.
- Anonymous post triggers region notifications with no author name leaked.
- "Mark all read" clears the badge; reload keeps it cleared.
- Clicking a notification navigates to the post and marks just that one read.
- Polling updates the badge without a full reload.
- Pre-migration DB: header still renders, bell shows 0, no 500s.

## Out of scope / future
- Email digest of notifications (separate feature).
- Following individual users or topics (regions only for now).
- Per-type notification preferences / mute settings.
- WebSocket push (deliberately excluded per §10).
