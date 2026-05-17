# Bookmark / Save Posts

**Domain:** Social, engagement & notifications
**Complexity:** S
**Status:** Proposed

## Summary
Let signed-in users save any post to a personal "Saved" list so they can find
it again later. A bookmark toggle appears next to the existing report action on
the article view, and saved posts are listed on the user's profile page.

## Why it fits BirdsEye
BirdsEye replaces the endless vertical feed with a map "control room"
(project.md §1). That map is great for discovery but bad for *retrieval* - once
a post scrolls out of the trending list there is no way back to it short of
remembering its location. Bookmarks give the lightweight "come back to this"
affordance that every news/bulletin product needs, and the data model already
anticipates per-user/per-post relations (`reactions`, `post_votes` in §7). It is
the smallest possible engagement feature and a natural companion to reactions
(§4.4).

## User value
- Keep a "developing story" or a community notice (e.g. a road closure) handy.
- A private list, distinct from the public reaction signal - no social pressure.
- Gives returning users a reason to sign in and come back.

## Data model changes
New table in `src/lib/server/db/schema.ts`, mirroring the `reactions` shape:

```ts
export const savedPosts = pgTable(
	'saved_posts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		postId: uuid('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		uniqueSave: unique('uniq_post_user_save').on(t.postId, t.userId),
		byUser: index('saved_user').on(t.userId, t.createdAt)
	})
);
```

## API / server changes
- New `src/routes/api/posts/[id]/save/+server.ts` - `POST` toggles a save
  (insert/delete on conflict, same pattern as `react/+server.ts:28-32`).
  Returns `{ saved: boolean }`. Require `locals.user` (401 otherwise).
- `src/lib/server/posts.ts` - add `getSavedPosts(userId)` returning
  `PostSummary[]`, reusing the vote/comment/reaction aggregation logic in
  `listPosts` (`posts.ts:160-204`); join `savedPosts` filtered by `userId`,
  ordered by `savedPosts.createdAt desc`.
- `src/lib/server/posts.ts` `getPostDetail` (`posts.ts:206-287`) - add a
  `viewerSaved` lookup to the `Promise.all` block (only when `viewerId` set),
  surface as `isSaved` on `PostDetail`.

## UI / component changes
- `src/lib/types.ts` - add `isSaved: boolean` to `PostDetail`.
- New `src/lib/components/SaveButton.svelte` - a bookmark-icon toggle with
  optimistic update, mirroring `ReactionBar.svelte:22-54`.
- `src/routes/post/[id]/+page.svelte` - render `<SaveButton>` in the
  `.post-actions` row beside "Report this post" (`+page.svelte:126-132`).
- `src/routes/+page.svelte` - render `<SaveButton>` in the in-panel post view
  `.post-actions` (`+page.svelte:894-901`).
- `src/routes/profile/[id]/+page.svelte` - when `isOwn`, add a "Saved" section
  below "Your posts" reusing the existing `.post-item` card markup
  (`+page.svelte:328-361`). Fed by `getSavedPosts` in
  `src/routes/profile/[id]/+page.server.ts`.
- `src/lib/components/UserMenu.svelte` - add a "Saved posts" link
  (`UserMenu.svelte:28`) pointing at `/profile/{id}#saved`.

## Dependencies & risks
- No new packages.
- Low risk: the toggle pattern, optimistic UI, and per-user uniqueness
  constraint are all already proven by `reactions`.
- Profile page must tolerate the table not existing yet - wrap the
  `getSavedPosts` query in the same `isMissingOptionalProfileColumn`-style
  try/catch already used in `users.ts:46-83` so a pre-migration DB degrades
  gracefully.

## Implementation steps
1. Add the `savedPosts` table to `schema.ts`; generate + run the Drizzle
   migration.
2. Add `isSaved` to `PostDetail` in `types.ts`.
3. Create `api/posts/[id]/save/+server.ts` with the toggle handler.
4. Add `getSavedPosts` and the `viewerSaved` lookup to `posts.ts`.
5. Build `SaveButton.svelte` with optimistic state + fetch.
6. Wire `SaveButton` into both post views (`/post/[id]` and home panel).
7. Add the "Saved" section + anchor to the profile page and load it in
   `profile/[id]/+page.server.ts` (own profile only).
8. Add the "Saved posts" link to `UserMenu.svelte`.

## Testing & verification
- Toggle save on a post; reload - state persists.
- Saved section on own profile lists the post; another user's profile never
  shows it.
- Unique constraint: double-clicking the button does not create duplicate rows.
- Deleting a post (cascade) removes its `saved_posts` rows.
- Signed-out user sees a disabled button / sign-in hint, never a 500.

## Out of scope / future
- Folders / collections of saved posts.
- Save counts shown publicly.
- Email digest of saved-post updates (covered by the digest feature).
