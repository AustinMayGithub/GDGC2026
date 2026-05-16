# Comment Sorting & Comment Reactions

**Domain:** Social, engagement & notifications
**Complexity:** M
**Status:** Proposed

## Summary
Make the comment thread richer without adding reply depth: a sort control
(Newest / Oldest / Top) and lightweight per-comment "helpful" reactions. "Top"
ranks comments by helpful count, surfacing the most useful discussion first —
which also improves the input the AI community note summarises.

## Why it fits BirdsEye
project.md §4.4 fixes comments as a flat thread and §12 explicitly recommends
*against* nested replies. Sorting and a single reaction are the engagement
upgrade that respects that decision — they add signal to a flat list instead of
structure. It also strengthens §4.5: the community note prompt currently feeds
the 20 *most recent* comments (`ai.ts:95-100, MAX_COMMENTS_IN_PROMPT`); feeding
the 20 *most helpful* comments produces a more representative opinion summary.

## User value
- Readers jump to the most useful takes instead of scrolling chronologically.
- Commenters get lightweight recognition (a "helpful" tally) without a full
  reaction palette.
- On a fast-moving "developing story", "Top" keeps the best context visible.

## Data model changes
New table in `src/lib/server/db/schema.ts` for per-comment reactions
(single emoji — keep it a "helpful 👍", not a palette, to limit moderation
surface per the §4.4 fixed-set rationale in `types.ts:92`):

```ts
export const commentReactions = pgTable(
	'comment_reactions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		commentId: uuid('comment_id')
			.notNull()
			.references(() => comments.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		uniqueCR: unique('uniq_comment_user_helpful').on(t.commentId, t.userId)
	})
);
```
Sorting needs no schema change — it is a query ordering.

## API / server changes
- `src/lib/server/posts.ts` `getComments` (`posts.ts:315-333`) — accept a
  `sort: 'new' | 'old' | 'top'` arg; left-join `commentReactions` with
  `count(*)` grouped by comment; order accordingly. Add `helpfulCount` and
  `viewerFoundHelpful` (when a viewerId is passed) to each row.
- `src/routes/api/posts/[id]/comments/+server.ts` `GET` (`+server.ts:9-11`) —
  read `?sort=` from the URL and pass it through; pass `locals.user?.id`.
- New `src/routes/api/comments/[id]/helpful/+server.ts` — `POST` toggles a
  comment reaction (insert/delete-on-conflict, same shape as
  `posts/[id]/react/+server.ts:17-32`), returns `{ helpfulCount, mine }`.
- `src/lib/server/ai.ts` `maybeRegenerateNote` (`ai.ts:95-100`) — change the
  comment query to order by helpful count desc (fallback `createdAt desc`) so
  the note summarises the most-engaged-with opinions.

## UI / component changes
- `src/lib/types.ts` — extend `CommentItem` with
  `helpfulCount: number; viewerFoundHelpful: boolean`.
- `src/lib/components/CommentThread.svelte`:
  - Add a sort `<select>` in the thread header (`CommentThread.svelte:114-119`)
    bound to a `sort` `$state`; on change, `fetch` `GET /comments?sort=` and
    replace the list.
  - Add a "👍 Helpful · N" toggle to each `.comment-meta` row
    (`CommentThread.svelte:127-143`), with optimistic update like
    `ReactionBar.svelte:22-54`.
  - The optimistic insert on new comment (`CommentThread.svelte:44-50`) must set
    `helpfulCount: 0, viewerFoundHelpful: false`.

## Dependencies & risks
- No new packages.
- Risk: "Top" sort with zero reactions degenerates to insertion order — make
  the secondary sort key `createdAt` so it stays deterministic.
- Risk: re-fetching on sort change loses optimistic comments not yet persisted —
  block the sort control while `submitting` is true.
- Cascade delete on `comments` cleans up `comment_reactions` automatically.

## Implementation steps
1. Add `commentReactions` to `schema.ts`; generate + run migration.
2. Extend `CommentItem` in `types.ts`.
3. Update `getComments` to accept `sort` + `viewerId` and aggregate helpful
   counts.
4. Update the comments `GET` endpoint to read `?sort=` and viewer.
5. Create `api/comments/[id]/helpful/+server.ts`.
6. Update `ai.ts` comment selection to order by helpfulness.
7. Add the sort select + helpful toggle to `CommentThread.svelte`.
8. Verify optimistic paths set the new fields.

## Testing & verification
- Switch sort between Newest/Oldest/Top; order changes correctly; Top with no
  reactions falls back to chronological.
- Toggle "helpful" on a comment; count updates optimistically and persists on
  reload; unique constraint blocks double-counting.
- Post a comment with sort = Top; optimistic comment renders without a console
  error.
- Generate a community note on a post with varied helpful counts; confirm the
  prompt receives the top-ranked comments (log the prompt in dev).

## Out of scope / future
- One-level replies (explicitly deferred in §12).
- A full emoji palette on comments.
- Comment editing/deletion.
