# "Developing Story" Post Updates & Timeline

**Domain:** Social, engagement & notifications
**Complexity:** L
**Status:** Proposed

## Summary
Let a post author append timestamped **updates** to their own post without
editing the original body. Updates render as a chronological timeline under the
article ("UPDATE 14:32 - road now reopened"). Each update notifies followers of
the post and the region, and is fed to the AI community note as additional
context. This makes a single post a living record of an unfolding event.

## Why it fits BirdsEye
BirdsEye is "part news site" where "news has a location and a blast radius"
(project.md §1). Real community news *evolves* - a flood warning, a power
outage, a missing-person notice. project.md §12 rules that posts should be
**deletable but not editable**, because "editing a voted-on factual post
undermines the votes." An append-only update timeline is the precise resolution
of that open question: the original claim (and its votes/credibility meter,
§4.4) stays immutable, while new information is added transparently with its own
timestamp. It complements the "developing story" idea and pairs naturally with
the follow/notifications feature.

## User value
- Authors keep one canonical post current instead of spamming new posts.
- Readers see how a story changed, in order, without losing the original.
- Votes on the original claim stay honest - updates never rewrite history.
- "Local" followers get pulled back when a story they care about progresses.

## Data model changes
New table in `src/lib/server/db/schema.ts`:

```ts
export const postUpdates = pgTable(
	'post_updates',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
		authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		body: text('body').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ byPost: index('updates_post').on(t.postId, t.createdAt) })
);
```
No change to `posts` - the original `title`/`body` (`schema.ts:67-68`) remain
immutable, upholding the §12 "no editing" decision.

## API / server changes
- New `src/routes/api/posts/[id]/updates/+server.ts`:
  - `POST` - author-only (compare `locals.user.id` to `posts.authorId`, the
    ownership pattern from `getPostDetail`'s `isOwn`, `posts.ts:270`). Validate
    body 1–2000 chars (mirror `comments/+server.ts:18-19`), run `moderateText`
    (`ai.ts:33`) before insert - moderation on the write path is an MVP
    requirement (§4.7). On success, fire `notify`/`notifyRegionFollowers` (from
    the notifications feature) and call `maybeRegenerateNote`.
  - `GET` - return all updates for the post, oldest-first.
- `src/lib/server/posts.ts` `getPostDetail` (`posts.ts:206-287`) - add an
  `updates` query to the `Promise.all` block; surface as `updates` on
  `PostDetail`.
- `src/lib/server/ai.ts` `maybeRegenerateNote` (`ai.ts:95-107`) - include the
  post's updates as context lines in the prompt so the note reflects the latest
  state of the story. Keep the §4.5 rules intact: the note still only summarises
  comment *opinions*; updates are background, not facts to endorse.

## UI / component changes
- `src/lib/types.ts` - add
  `PostUpdate { id, body, createdAt }` and `updates: PostUpdate[]` to
  `PostDetail`.
- New `src/lib/components/UpdateTimeline.svelte` - renders updates as a vertical
  timeline (timestamp + body); shows "No updates yet" when empty. Reuse the
  `formatDate` helper already in `post/[id]/+page.svelte:49-58`.
- New `src/lib/components/AddUpdateForm.svelte` - a compose box shown only to
  the author; optimistic append on submit, mirroring
  `CommentThread.svelte:38-75`.
- `src/routes/post/[id]/+page.svelte` - render `<UpdateTimeline>` directly below
  `.article-body` (`+page.svelte:118-124`) and `<AddUpdateForm>` when
  `post.isOwn`.
- `src/routes/+page.svelte` - render the same two components in the in-panel
  post view, below the `.article-body` block (`+page.svelte:855-861`).
- Optional: a small "Updated" badge on the headline list / trending entry when
  a post has updates - surface an `updateCount` on `PostSummary` from
  `listPosts` (`posts.ts:160-204`, add a grouped count like the comment count).

## Dependencies & risks
- No new packages.
- Depends on the in-app notifications feature for the notify hooks; if that is
  not shipped, the update still works - just skip the `notify*` calls.
- Risk: updates could be abused to materially change a claim after voting.
  Mitigation: updates are clearly separated, timestamped, and never alter the
  original body or reset votes - exactly the transparency §12 asks for. A report
  button on updates can be added later.
- Risk: regenerating the note on every update adds OpenAI calls - it is already
  debounced/cached per §4.5/§6; reuse `maybeRegenerateNote` unchanged.
- New table needs the graceful "does not exist" tolerance pattern
  (`users.ts:31-44`) if migrations lag.

## Implementation steps
1. Add `postUpdates` to `schema.ts`; generate + run migration.
2. Add `PostUpdate` + `updates` to `types.ts`.
3. Create `api/posts/[id]/updates/+server.ts` (author-gated POST with
   moderation; GET).
4. Add the `updates` query to `getPostDetail`; optionally add `updateCount` to
   `listPosts`.
5. Feed updates into the `maybeRegenerateNote` prompt context.
6. Build `UpdateTimeline.svelte` and `AddUpdateForm.svelte`.
7. Wire both into `/post/[id]` and the home in-panel post view.
8. Hook update creation into `notify`/`notifyRegionFollowers` if available.
9. (Optional) Add the "Updated" badge to headline/trending entries.

## Testing & verification
- Author adds an update; it appears on the timeline with a timestamp;
  non-authors see the timeline but no compose form.
- A non-author POST to `/updates` is rejected (403).
- The original body and the credibility meter are unchanged after an update.
- Update body is moderated before storage (flagged content rejected, 422).
- Community note regenerates and reflects the latest state.
- Followers receive a notification for the update (when notifications shipped).
- Optimistic append rolls back on a failed request.

## Out of scope / future
- Editing or deleting an individual update.
- Rich media in updates (images, links).
- A map "time scrubber" replaying update spread (§9 stretch idea).
- Marking a story "resolved / closed".
