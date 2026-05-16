# Post Edit/Delete Policy & UI

**Domain:** Performance, infrastructure, accessibility & UX
**Complexity:** M
**Status:** Proposed

## Summary
project.md §12 leaves post editing/deletion as an open question and suggests
"delete yes, edit no for 48h — editing a voted-on factual post undermines the
votes." This plan implements that policy: an author can **delete** their own
post; **editing** is allowed only in a narrow, vote-safe form. Right now there
is no delete endpoint and no author controls in the UI — `getPostDetail`
already computes `isOwn` (`posts.ts:270`) but nothing consumes it.

## Why it fits BirdsEye
Directly resolves the §12 open question. §4.4/§9.3 make the credibility vote the
single truth signal — so the policy must protect it: deleting cascades cleanly
(the schema's `onDelete: 'cascade'` on `post_votes`, `comments`, etc. handles
that), while editing the body of a voted-on factual post is forbidden because it
would silently invalidate existing verify/dispute votes. The plan honours the
"crowd owns the verdict" principle from §1.

## User value
- Authors can remove a post they regret (typo, wrong location, mis-category).
- Authors can fix a personal post or an un-voted factual post without it
  becoming permanently wrong.
- Voters are protected: a factual post's claim cannot be swapped out from under
  their votes.

## Data model changes
None strictly required — `onDelete: 'cascade'` foreign keys in
`src/lib/server/db/schema.ts` already clean up votes, comments, reactions,
notes and reports when a post row is deleted.

Optional, recommended for honesty: add `updatedAt: timestamp(...)` and
`editedAt: timestamp(...)` (nullable) to `posts` so the UI can show "edited".
A soft-delete `deletedAt` is an alternative to hard delete; hard delete is
simpler and the cascades make it safe — recommend hard delete for 48h.

## API / server changes
- New `DELETE` handler in `src/routes/api/posts/[id]/+server.ts`:
  - Require `locals.user`; load the post; reject 403 unless
    `post.authorId === locals.user.id`.
  - `db.delete(posts).where(eq(posts.id, params.id))` — cascades handle the
    rest. If the object-storage image plan lands, also delete the stored
    image object here.
- New `PATCH` handler in the same file for editing, enforcing the policy:
  - Always allow editing `title`/`body` for **personal** posts.
  - For **factual** posts, allow editing **only if the post has zero votes**
    (a single `count(*)` on `post_votes` for that post). Otherwise 409 with a
    clear message ("This post has been voted on and can no longer be edited").
  - Re-run `moderateText` (`src/lib/server/ai.ts`) on edited content, mirroring
    the create path (`api/posts/+server.ts:86`).
  - Disallow changing `category` after creation (it drives divergent code
    paths, §4.6) and changing location/radius once voted (location anchors the
    vote location-gate in `vote/+server.ts:45`).
  - Set `editedAt` if the column is added.

## UI / component changes
- `src/routes/+page.svelte` — the post panel already loads `selectedPostDetail`
  which carries `isOwn`. Add an author controls row in `.post-actions`
  (line 894): a "Delete" button (with an accessible confirm — not
  `window.confirm`; reuse an inline-confirm pattern) and, when editing is
  permitted, an "Edit" button that reopens the compose-style panel pre-filled.
- `src/routes/post/[id]/+page.svelte` — `data.post.isOwn` is available; add the
  same author controls on the full-page article view.
- Edit flow can reuse the compose panel: pre-fill `composeTitle`/`composeBody`
  from the post, disable the category picker and (when voted) the location/
  radius controls, and submit via `PATCH` instead of `POST`.
- After delete, close the panel, call `fetchPosts()` and `clearSelectedPost()`
  (`+page.svelte:307`).
- Show an "edited" timestamp in `.article-meta` (`+page.svelte:839`) when
  `editedAt` is set.

## Dependencies & risks
- No new dependencies.
- Risk: an accessible confirmation dialog — do not use `window.confirm`
  (see the accessibility plan); use an inline two-step confirm.
- Risk: race between an edit and an incoming vote — the zero-votes check and
  the insert happen close together; acceptable at hackathon scale, but wrap the
  factual-edit check + update in a transaction for correctness.
- Risk: anonymous posts — `isOwn` is computed server-side from `authorId`
  regardless of the `anonymous` flag (`posts.ts:268-270`), so author controls
  still work for the real author; confirm the UI does not leak identity.

## Implementation steps
1. (Optional) add `editedAt` to `posts` schema; `npm run db:push`.
2. Add the `DELETE` handler with the ownership check to
   `api/posts/[id]/+server.ts`.
3. Add the `PATCH` handler enforcing the personal-always / factual-only-if-
   unvoted policy, re-running moderation, in a transaction.
4. Add an accessible delete-confirm + author controls row to the post panel in
   `+page.svelte` and to `post/[id]/+page.svelte`.
5. Implement the edit flow by reusing the compose panel in a `PATCH` mode.
6. Surface an "edited" indicator in the article meta.

## Testing & verification
- Delete own post → it disappears from list and map; votes/comments cascade
  (verify no orphan rows).
- Attempt to delete another user's post → 403.
- Edit a personal post → succeeds. Edit an un-voted factual post → succeeds.
- Edit a voted factual post → 409 with the policy message.
- Edited content runs through moderation.
- `npm run check` passes.

## Out of scope / future
- Edit history / revisions.
- Admin override delete (covered by a moderation-dashboard plan).
- Soft-delete + restore.
