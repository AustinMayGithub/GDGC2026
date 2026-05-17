# Full-text Post Search

**Domain:** Performance, infrastructure, accessibility & UX
**Complexity:** M
**Status:** Proposed

## Summary
BirdsEye currently has no way to find a post by words - `listPosts`
(`src/lib/server/posts.ts:160`) only orders by `createdAt` and caps at 300 rows,
and the home page ranks client-side. Add a Postgres full-text search over post
title + body, exposed through the existing `/api/posts` endpoint with a `q`
parameter and a search input in the header.

## Why it fits BirdsEye
project.md §9.9 explicitly flags that "show all posts doesn't scale even in a
demo" and §1 frames BirdsEye as "part news site". A news site without search is
incomplete. Postgres is already the datastore (§5) and `posts` already has
`title` + `body` columns (`schema.ts:64-67`), so this is a natural, no-new-infra
addition that strengthens the demo narrative.

## User value
- Find a story by keyword instead of hunting on the map.
- Judges can quickly locate seeded demo posts (§10 seeded data) by name.
- Pairs naturally with region filtering already supported by `listPosts`.

## Data model changes
Add a generated `tsvector` column and a GIN index on `posts`
(`src/lib/server/db/schema.ts`):

```ts
// inside posts pgTable column block
searchVector: tsvector('search_vector')
  .generatedAlwaysAs(
    sql`to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))`
  ),
// inside the index callback
searchIdx: index('posts_search').using('gin', t.searchVector)
```

Drizzle has no native `tsvector` type - define a small `customType` helper
(e.g. `src/lib/server/db/columns.ts`) returning `dataType: () => 'tsvector'`.
The column is `GENERATED ALWAYS`, so no write-path changes are needed. Apply
via `npm run db:push`.

## API / server changes
- `src/lib/server/posts.ts` - extend `listPosts(opts)` with an optional
  `query?: string`. When present, add a `WHERE search_vector @@
  websearch_to_tsquery('english', $query)` clause and order by
  `ts_rank(search_vector, query)` then `createdAt`. Keep the existing
  region filter composable with `and(...)`.
- `src/routes/api/posts/+server.ts:44` (`GET`) - read
  `url.searchParams.get('q')`, trim, pass to `listPosts`. Empty `q` = current
  behaviour. Cap query length (e.g. 100 chars) before passing it on.
- The `isMissingOptionalPostColumn` fallback pattern in `posts.ts:46` should be
  extended to tolerate a missing `search_vector` column so an un-migrated DB
  still serves non-search requests.

## UI / component changes
- `src/routes/+page.svelte` - add a search `<input>` in `.header-center`
  (near the scope toggle, lines 671-714). Debounce input (~250 ms) and call the
  existing `fetchPosts()` flow with the new `q` param; the fetch URL is built at
  `+page.svelte:326`. Add `searchQuery = $state('')` and include it in the
  request. When `q` is set, the headline list and map show ranked results.
- Show a "N results for …" affordance and a clear button; reuse the existing
  empty-state card (`+page.svelte:777`) when zero matches.
- New small component `src/lib/components/SearchBox.svelte` to keep
  `+page.svelte` from growing further.

## Dependencies & risks
- No new npm dependencies - uses native Postgres FTS.
- Risk: Drizzle `customType` for `tsvector` plus a `GENERATED ALWAYS` column
  via `drizzle-kit push` - verify the generated migration SQL; may need a
  hand-written `ALTER TABLE` if `push` cannot express the generated expression.
- Risk: `websearch_to_tsquery` ignores some operators silently - acceptable for
  a hackathon; document it.

## Implementation steps
1. Add the `tsvector` `customType` helper and the `searchVector` column +
   GIN index to `schema.ts`; run `npm run db:push` and verify the SQL.
2. Extend `listPosts` with the `query` branch (rank + filter), keeping region
   filtering composable.
3. Add the `q` param handling and length cap to `/api/posts` `GET`.
4. Build `SearchBox.svelte` with debounced input + clear button.
5. Wire it into `+page.svelte` header; thread `q` into `fetchPosts()`.
6. Handle the zero-results state with the existing empty-state card.

## Testing & verification
- Seed data (`src/lib/server/seed.ts`) provides posts; search a known keyword,
  confirm ranked results and that markers/headlines update together.
- Verify region + search combine (local scope + query).
- Confirm SQL injection safety - query is bound, never interpolated.
- `npm run check` passes; un-migrated DB still serves `/api/posts` without `q`.

## Out of scope / future
- Searching comments or author names.
- Fuzzy / typo-tolerant search (`pg_trgm`).
- Search-result highlighting / snippet generation.
