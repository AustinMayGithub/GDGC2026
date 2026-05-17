# Evidence / Source Linking on Posts

**Domain:** Trust, credibility & anti-abuse
**Complexity:** M
**Status:** Proposed

## Summary
Let the author of a factual post attach a short list of source links (news
article, official notice, photo, etc.). The article view shows these as a
"Sources" block, and voters see them before casting a verify/dispute vote.

## Why it fits BirdsEye
`project.md` §2 defines a factual post as "a claim about something that
happened" that "gets the full treatment: voting + community note." Right now a
factual post offers a title and body and nothing else for a voter to judge
against - the credibility meter (§4.4) asks the crowd to rule on a claim with no
evidence trail. Source links give the crowd something concrete to verify,
strengthening the truth signal §1 depends on without letting the AI pronounce a
verdict (§4.5 forbids that). It also raises the cost of posting a fabricated
factual claim.

## User value
Posters can back their claim; readers can check it themselves instead of voting
blind; the verify/dispute decision becomes evidence-based rather than vibes-based.

## Data model changes
Add a `post_sources` table (Drizzle, `src/lib/server/db/schema.ts`):

```ts
export const postSources = pgTable('post_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  label: text('label'),                // optional author-supplied caption
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => ({ byPost: index('sources_post').on(t.postId) }));
```

A separate table (not a JSON column on `posts`) keeps it queryable and bounded.

## API / server changes
- `src/routes/api/posts/+server.ts` (post creation) - accept an optional
  `sources: string[]` field; for each, validate it parses as an `http(s)` URL,
  cap at 5 entries, then insert into `post_sources`. Reject only on malformed
  input - do not fetch the URLs at write time.
- New `src/lib/server/posts.ts` helper `getPostSources(postId)` returning
  `{ url, label }[]`, called inside `getPostDetail` (`posts.ts:206`).
- Add `sources: PostSource[]` to `PostDetail` in `src/lib/types.ts:58-66` and a
  `PostSource` interface.
- Run the optional `label` text through `moderateText` (already used for
  comments in `comments/+server.ts:27`) since it is user-generated free text.

## UI / component changes
- Posting panel (factual branch) - add a repeatable "Add a source link" input
  group; only shown when category is `factual` (mirrors the §4.6 divergence the
  app already enforces). Likely `src/routes/+page.svelte` posting panel or the
  posting component alongside `CategoryPicker.svelte`.
- Article view - new `src/lib/components/SourceList.svelte`: renders each source
  as a link with its hostname shown, `rel="noopener nofollow"`,
  `target="_blank"`. Place it in the left article column near the body, above
  the credibility meter, so voters see evidence before voting.
- Empty state: "No sources attached" so absence is visible (itself a signal).

## Dependencies & risks
- No new packages - `URL` constructor for validation.
- Risk: a source link could point to malicious content. Mitigation: never
  auto-fetch, never preview-render; `rel="nofollow noopener"`, show only the
  hostname text, open in a new tab.
- Risk: scope creep into link-preview cards. Explicitly out of scope.
- Risk: editing - the app currently disallows post editing (§12 "delete yes,
  edit no"), so sources are fixed at creation; acceptable for 48h.

## Implementation steps
1. Add the `postSources` table to `schema.ts`; generate the migration.
2. Extend `POST /api/posts` to validate and persist up to 5 source URLs +
   optional moderated labels.
3. Add `getPostSources()` and wire it into `getPostDetail`; extend `PostDetail`
   / add `PostSource` to `types.ts`.
4. Add the repeatable source inputs to the factual branch of the posting panel.
5. Build `SourceList.svelte` and place it in the article view above the meter.
6. Add the "no sources" empty state.

## Testing & verification
- Create a factual post with 2 valid URLs → both render as hostname links.
- Submit a non-URL string → rejected with a clear message; post not created
  with a partial source set.
- Submit 7 URLs → only 5 persisted (or rejected - pick one and test it).
- Confirm personal posts never show the source inputs.

## Out of scope / future
- Rich link-preview cards (title/image scraping).
- Per-source community voting on whether a source supports the claim.
- Domain reputation / known-unreliable-source flagging.
