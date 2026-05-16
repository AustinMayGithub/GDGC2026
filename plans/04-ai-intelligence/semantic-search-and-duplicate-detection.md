# Semantic Search & Duplicate / Related-Post Detection

**Domain:** AI & content intelligence
**Complexity:** L
**Status:** Proposed

## Summary
Generate a vector embedding for every post on creation and store it in PostgreSQL via `pgvector`. This powers two features off one pipeline: (1) **semantic search** — a search box that finds posts by meaning, not keyword; and (2) **duplicate / related-post detection** — at compose time, warn the user "3 people already posted about this" and on the article view show a "Related posts" list. Both surface connections; neither makes any truth claim.

## Why it fits BirdsEye
project.md's vision (§1) is that "news has a location and a blast radius" — multiple people will post about the same incident (a power outage, a crash) from nearby. Right now there is no way to find or relate those posts; the national feed is just "recent + engagement" (§9.9) and there is no search at all. Semantic clustering of posts about one real event is a natural fit for a community-news map. It respects §4.5: similarity is a content-relatedness signal, never a credibility signal — "related" never implies "corroborated" or "true." The duplicate warning is a soft nudge, never a block; the crowd vote remains the only truth signal.

## User value
- **Search:** find "that crash on SH1 near Kapiti" without guessing exact words.
- **Duplicate detection at compose:** reduces redundant posts; nudges users toward commenting on / voting on the existing post instead — which concentrates the crowd signal where it matters.
- **Related posts on the article view:** lets readers see other angles on the same event without the AI claiming any of them is correct.

## Data model changes
- Requires the `pgvector` extension (`CREATE EXTENSION vector`). The PostGIS Docker image in §5 is Postgres-based; `pgvector` installs alongside, or switch to an image bundling both.
- Add to `posts` (`schema.ts:59`):
```ts
embedding: vector('embedding', { dimensions: 1536 }) // text-embedding-3-small | null
```
Nullable so posts created before embedding (or when no API key) still work. Use `drizzle-orm`'s pgvector column type (or a `customType` if the installed Drizzle version lacks native support).
- Add an HNSW or IVFFlat index on `embedding` for fast cosine search.

## API / server changes
- `src/lib/server/ai.ts` — new `embedText(text): Promise<number[] | null>`:
  - Model: `text-embedding-3-small` (1536-dim, cheap — ~$0.00002 per post). `getClient()` (`ai.ts:23`) is reused.
  - Failure fallback: on error / no API key, return `null`; the post is stored with a null embedding and is simply absent from semantic results.
- `src/routes/api/posts/+server.ts` `POST` (line 51): after the post insert (line 105), compute `embedText(`${title}\n\n${body}`)` and update the row. Non-blocking, wrapped in `try/catch` — embedding failure must never fail the post (follow the `maybeRegenerateNote` never-throws pattern, `ai.ts:87`).
- New `src/routes/api/search/+server.ts` — `GET ?q=...`: embed the query, run a cosine-distance query against `posts.embedding`, return top ~15 `PostSummary` rows. Optionally bias/filter by `regionId` to fit the location-first product. Cache the query embedding per request only.
- New `src/lib/server/posts.ts` helper `relatedPosts(postId, limit)`: cosine search excluding the post itself; reuse for both compose-time duplicate check and article-view related list. Add a similarity threshold so weak matches are dropped.
- New `src/routes/api/compose/similar/+server.ts` — `POST { title, body }`: embed the draft, return up to 3 nearest existing posts above the duplicate threshold, with distances.
- Backfill: a one-off script to embed seeded demo posts (the §11 hour-38 seed task should run it) so search/related work in the demo.

## UI / component changes
- New `src/lib/components/SearchBar.svelte` and a results view (could reuse `HeadlineList.svelte` styling). Place the search entry on the home page near the headline list.
- `src/routes/compose/+page.svelte`: in a debounced `$effect` on `title`/`body` (alongside the category-suggestion effect if that plan also ships), call `/api/compose/similar`. If matches return, render a soft inline panel: "Similar posts already exist — [titles]. You can still post." Never block submission.
- Article view (`src/routes/post/[id]/+page.svelte`): add a "Related posts" section fed by `relatedPosts`, with a clear label like "Other posts mentioning similar things — not a confirmation."
- `src/lib/types.ts`: a `SearchResult` / reuse `PostSummary`; add a `RelatedPost` if a distance field is wanted.

## Dependencies & risks
- New dependency: `pgvector` extension + a Drizzle vector column type. This is the main setup cost — verify the Docker image supports it early (§11 hour 0-6 block).
- Risk: embedding API latency on post create — mitigated by doing it non-blocking after the insert.
- Risk: `pgvector` + PostGIS in one image — confirm a combined image or install both extensions in the DB init script.
- Risk: "related" being misread as "corroborated." Mitigate with explicit UI copy and by never showing similarity near the credibility meter.
- Scope risk: this is two features on one pipeline — if time-boxed, ship the embedding pipeline + duplicate detection first (higher demo value at compose time), search second.

## Implementation steps
1. Add `pgvector` to the DB image / init script; verify it coexists with PostGIS.
2. Add the `embedding` column + vector index to `posts` in `schema.ts`; generate a migration.
3. Add `embedText` to `src/lib/server/ai.ts`.
4. Embed posts on create in `api/posts/+server.ts` (non-blocking).
5. Add `relatedPosts` to `posts.ts`; create `api/search`, `api/compose/similar` endpoints.
6. Build `SearchBar.svelte` + results, the compose duplicate panel, and the article-view related section.
7. Write the seed-data backfill script and run it with the §11 seed task.

## Testing & verification
- Unit: `embedText` returns a 1536-length array, `null` with no API key.
- Manual: search a paraphrased query → semantically matching posts rank top. Compose a post near-identical to an existing one → duplicate warning fires; a distinct post → no warning.
- Confirm posts with null embeddings are simply absent from results, never error.
- Confirm related-post UI carries the "not a confirmation" label.

## Out of scope / future
- Cross-region trending-topic clustering.
- Embedding comments for in-thread search.
- Hybrid keyword + vector ranking.
- Auto-merging duplicate posts (would destroy independent vote tallies — excluded).
