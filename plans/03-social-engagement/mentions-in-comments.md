# @mentions in Comments

**Domain:** Social, engagement & notifications
**Complexity:** M
**Status:** Proposed

## Summary
Let commenters reference another user with `@displayname`. The mention renders
as a link to that user's profile and creates a notification for the mentioned
person (delivered through the in-app notification feature). This is the
conversational glue a flat comment thread otherwise lacks.

## Why it fits BirdsEye
project.md §4.4 commits to a *flat* comment thread and §12 rejects nested
replies. Without threading, there is no way to address a specific person in a
discussion. `@mentions` restore "I'm replying to you" semantics without adding
tree structure — a perfect fit for the flat model. Profiles already exist
(`profile/[id]/+page.svelte`) and carry reputation, so a mention naturally links
into the platform's identity layer (§3).

## User value
- Direct a reply at one person inside a flat thread.
- The mentioned user is pulled back into the conversation via a notification.
- Tighter, more legible discussions feed a better AI community note (§4.5).

## Data model changes
None required for rendering. Mentions are resolved at write time and stored
implicitly via the notification row (see the in-app notifications plan's
`notifications` table). If that feature ships separately, this plan adds one
table:

```ts
export const commentMentions = pgTable(
	'comment_mentions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		commentId: uuid('comment_id')
			.notNull()
			.references(() => comments.id, { onDelete: 'cascade' }),
		mentionedUserId: uuid('mentioned_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' })
	},
	(t) => ({ byUser: index('mention_user').on(t.mentionedUserId) })
);
```
The `comments.body` column (`schema.ts:114`) stores the raw text including the
`@name` token — no schema change to `comments` itself.

## API / server changes
- New `src/lib/server/mentions.ts`:
  - `extractMentions(body): string[]` — regex `/@([\w][\w .'-]{1,49})/g`,
    longest-match against the candidate set.
  - `resolveMentions(body, postId)` — query `users.displayName` (case-insensitive,
    `schema.ts:18-30`) restricted to users who have *commented on or authored*
    the post, to keep the lookup scoped and cheap; return matched user rows.
- `src/routes/api/posts/[id]/comments/+server.ts` `POST` (`+server.ts:13-49`) —
  after inserting the comment and *after* `moderateText` passes
  (`+server.ts:27`), call `resolveMentions`, insert `commentMentions` rows, and
  enqueue a notification per mentioned user (skip self-mentions). Return a
  `mentions` array on the response so the client can render links immediately.
- New `src/routes/api/posts/[id]/mention-candidates/+server.ts` — `GET` returns
  the distinct display names of users who have participated in the thread, for
  the autocomplete dropdown.

## UI / component changes
- `src/lib/types.ts` — add `mentions: { name: string; userId: string }[]` to
  `CommentItem`.
- New `src/lib/components/CommentBody.svelte` — tokenises a comment body and
  renders matched `@name` spans as `<a href="/profile/{id}">`; plain text
  otherwise. Replaces the raw `{comment.body}` render at
  `CommentThread.svelte:144`.
- `src/lib/components/CommentThread.svelte` — in the compose `<textarea>`
  (`CommentThread.svelte:182-189`), add a lightweight autocomplete: on `@` +
  typing, fetch `mention-candidates`, show a positioned suggestion list, insert
  on select. Keep it minimal — a `$state` list and absolute-positioned `<div>`.

## Dependencies & risks
- No new packages — a hand-rolled tokeniser/autocomplete is enough at this
  scale.
- Risk: display names are not unique (`users.displayName` has no unique
  constraint, `schema.ts:21`). Resolve ambiguous names to *all* matching users,
  or scope to thread participants (recommended) so collisions are rare; if still
  ambiguous, link the most-recent commenter.
- Risk: names contain spaces — the regex must allow them but stop at sensible
  boundaries; cap match length at 50 chars (the display-name max).
- XSS: render mention spans via Svelte's escaped interpolation, never `@html`.

## Implementation steps
1. (If the notifications table is not yet present) add `commentMentions` to
   `schema.ts` and migrate.
2. Add `mentions` to `CommentItem` in `types.ts`.
3. Write `src/lib/server/mentions.ts` with extract + resolve helpers.
4. Add the `mention-candidates` GET endpoint.
5. Update the comments `POST` handler to resolve mentions, persist them, and
   enqueue notifications.
6. Build `CommentBody.svelte` and swap it into `CommentThread.svelte`.
7. Add `@` autocomplete to the compose textarea.
8. Ensure `getComments` (`posts.ts:315-333`) returns resolved mentions per
   comment.

## Testing & verification
- Comment `@Alice great point` links "Alice" to her profile and notifies her.
- Self-mention creates no notification.
- A name with no matching thread participant renders as plain text, no link.
- Ambiguous name resolves deterministically (documented rule) and never errors.
- Autocomplete inserts the chosen name and closes on selection / blur.
- Moderation still runs before the comment (and its mentions) are stored.

## Out of scope / future
- Mentions in post bodies.
- Global user search for mentions (kept scoped to thread participants for 48h).
- Email notification for mentions (handled by the digest feature).
