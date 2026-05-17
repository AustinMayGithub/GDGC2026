# Comment "Helpful" Voting

**Domain:** Trust, credibility & anti-abuse
**Complexity:** S
**Status:** Proposed

## Summary
Add a single "Helpful" upvote to each comment. Helpful counts surface the most
useful comments in a thread and let the comment list sort by helpfulness, which
also makes the AI community note's input cleaner.

## Why it fits BirdsEye
`project.md` §4.4 already specifies lightweight reactions on posts but comments
have no quality signal at all. The community note (§4.5) summarises "the
opinions expressed in the comments" - if the crowd can mark which comments are
helpful, the discussion the AI summarises (and the discussion a reader skims)
is higher-signal. It is a small, on-theme trust primitive: the crowd, not the
AI, decides what is useful - consistent with the §1 separation of crowd and AI.

## User value
Good explanations and corrections rise to the top of the thread; a reader gets
the gist of a discussion faster; low-effort noise sinks.

## Data model changes
Add a `comment_helpfuls` table (Drizzle, `src/lib/server/db/schema.ts`),
modelled on the existing `reactions` table (`schema.ts:122-138`):

```ts
export const commentHelpfuls = pgTable('comment_helpfuls', {
  id: uuid('id').primaryKey().defaultRandom(),
  commentId: uuid('comment_id').notNull()
    .references(() => comments.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  uniqueHelpful: unique('uniq_comment_user_helpful').on(t.commentId, t.userId),
  byComment: index('helpfuls_comment').on(t.commentId)
}));
```

The `unique` constraint enforces one helpful per user per comment (same pattern
as `uniq_post_user_emoji`, `schema.ts:136`).

## API / server changes
- New endpoint `src/routes/api/comments/[id]/helpful/+server.ts`, `POST`:
  require `locals.user` (mirror `comments/+server.ts:14`); toggle a
  `comment_helpfuls` row via `onConflictDoNothing` + delete-if-exists, or an
  upsert toggle; return the new count.
- `getComments` in `src/lib/server/posts.ts:315-333` - add a left join /
  grouped count of `comment_helpfuls`, plus a `mine` flag for the viewer
  (`getComments` needs a `viewerId` param, like `getPostDetail`). Return
  `helpfulCount` and `helpfulByMe` on each row.
- Add `helpfulCount: number` and `helpfulByMe: boolean` to `CommentItem` in
  `src/lib/types.ts:85-90`.

## UI / component changes
- `src/lib/components/CommentThread.svelte` - add a small "👍 Helpful
  {count}" toggle button in `.comment-meta` (`CommentThread.svelte:127-143`),
  next to the existing Report trigger. Optimistic update like the existing
  comment/report fetches (`CommentThread.svelte:54-74`).
- Optional: a "Top" / "Newest" sort toggle on the thread heading
  (`CommentThread.svelte:114-119`); "Top" orders by `helpfulCount` desc.

## Dependencies & risks
- No new packages.
- Risk: helpful votes could themselves be brigaded. Acceptable - they only
  reorder a thread, they do not affect the post credibility meter.
- Risk: only signed-in users can vote helpful (matches comment posting,
  `comments/+server.ts:14`); show a sign-in hint for guests.

## Implementation steps
1. Add the `commentHelpfuls` table to `schema.ts`; generate the migration.
2. Create `POST /api/comments/[id]/helpful` with toggle semantics.
3. Add `viewerId` to `getComments`, join the helpful counts, return new fields.
4. Extend `CommentItem` in `types.ts`.
5. Add the Helpful toggle button + optimistic state to `CommentThread.svelte`.
6. (Optional) add the Top/Newest sort toggle.

## Testing & verification
- Click Helpful → count increments, button shows active; click again → reverts.
- Two accounts each mark the same comment → count is 2, not duplicated per user.
- Guest sees a disabled/sign-in-prompt state.
- "Top" sort orders the most-helpful comment first.

## Out of scope / future
- A "not helpful" / downvote - keep it one-directional to avoid pile-ons.
- Feeding `helpfulCount` into community-note prompt weighting.
- Author reputation credit for helpful comments (see author-reputation plan).
