# Community Note Quality Upgrade - Cited Comments & Agreement Clusters

**Domain:** AI & content intelligence
**Complexity:** M
**Status:** Proposed

## Summary
Upgrade the community note from a single opaque paragraph into a structured opinion summary that (a) groups commenters into agreement clusters ("most say X", "a few say Y") and (b) cites the comment numbers each cluster draws from, so a reader can click through to the actual comments. The note's job stays exactly as §4.5 defines it - summarising opinions - but it becomes traceable and more useful.

## Why it fits BirdsEye
project.md §4.5 says the note's "one job" is to "summarise the opinions expressed in the comments - what readers are saying and the range of views." Citing comment numbers and clustering agreement is *more* of that job, not a different one - it makes the summary verifiable against its source instead of asking readers to trust an opaque paragraph. It strictly respects §4.5: clusters are described as "what commenters say," never as evidence or verdict, and the note still never pronounces the post true or false. The crowd vote bar (`CredibilityMeter.svelte`) remains the sole credibility signal. The current prompt in `ai.ts:12-21` already forbids verdicts; this plan keeps every one of those rules.

## User value
- A reader can see *which* comments back a claimed majority opinion and jump to them - transparency about how the summary was formed.
- "Agreement clusters" make a 30-comment thread legible at a glance without implying who is right.
- Reinforces the §4.5 framing: it visibly reports the discussion, it does not judge it.

## Data model changes
Extend `community_notes` (`schema.ts:140`):
```ts
// add to communityNotes table
clusters: jsonb('clusters'),        // [{ stance: string, commentNumbers: number[] }] | null
commentIndexMap: jsonb('comment_index_map') // { [number]: commentId } - maps note's 1-based indices to real comment ids
```
`clusters` and `commentIndexMap` are nullable so existing rows and the no-API-key path still work. The note's `body` column is unchanged (still the prose summary).

## API / server changes
- `src/lib/server/ai.ts` - rework `summariseOpinions` (line 56):
  - The function already builds a numbered list (`ai.ts:59-61`). Capture that numbering and return alongside it a map of index → `comment.id` (the `recent` rows in `maybeRegenerateNote` at `ai.ts:95-100` carry ids - add `id: comments.id` to that select).
  - Change the prompt to request strict JSON: `{ summary: string, clusters: [{ stance, commentNumbers }] }`. Keep every existing rule from `SYSTEM_PROMPT` (`ai.ts:16-21`) verbatim - no fact-check, no verdict, no own opinion - and add: "`stance` describes a viewpoint commenters expressed; `commentNumbers` are the list indices voicing it. Do not invent numbers."
  - Model: `gpt-4o-mini` (`ai.ts:7`), bump `max_tokens` to ~350, `temperature: 0.3`.
  - Cost: still well under a cent per regeneration; runs debounced after each comment as today (`comments/+server.ts:35`).
  - Failure fallback: if JSON parse fails or API errors, fall back to storing just `body` (plain summary) with `clusters: null` - degrades gracefully to today's behaviour. The `try/catch` at `ai.ts:131` already guarantees the comment write never fails.
- `src/lib/server/posts.ts` `getPostDetail` (line 206): include `clusters` and `commentIndexMap` when reading `communityNotes` (line 223) and pass them through in the returned `communityNote` object (line 276).
- Validate cited `commentNumbers` server-side against the index map before storing - drop any number with no mapping (defends against model hallucinating indices).

## UI / component changes
- `src/lib/types.ts`: extend `CommunityNote` (line 51) with optional `clusters: { stance: string; commentIds: string[] }[] | null` - resolve indices to ids server-side so the UI never sees raw numbers.
- `src/lib/components/CommunityNote.svelte`: below the summary paragraph (line 32), render each cluster as a row: the stance text plus small "cited: comment 3, 7" chips. Clicking a chip scrolls to / highlights that comment.
- `src/lib/components/CommentThread.svelte`: accept an optional `highlightCommentId` and add an `id` anchor + transient highlight style to each `.comment` (line 126) so chip clicks can target it.
- Keep the existing subtitle "AI summary of the discussion - not a fact check" (`CommunityNote.svelte:27`) - it is the §4.5 label and must stay.

## Dependencies & risks
- No new dependencies. `jsonb` is available via `drizzle-orm/pg-core` (extend the import at `schema.ts:1`).
- Risk: model cites a wrong/nonexistent comment number - mitigated by server-side validation against `commentIndexMap`.
- Risk: clusters could read as a verdict ("most say it's fake"). Mitigate in the prompt and UI copy - stances are framed as "commenters say…", and the not-a-fact-check label stays prominent.
- Migration risk: adding nullable columns is safe; the codebase's `isMissingOptionalPostColumn` pattern (`posts.ts:46`) shows they already handle additive schema drift gracefully - apply the same try/fallback if reading the new columns.

## Implementation steps
1. Add `clusters` + `commentIndexMap` `jsonb` columns to `communityNotes` in `schema.ts`; generate a Drizzle migration.
2. Add `id` to the `recent` comment select in `maybeRegenerateNote` (`ai.ts:95`).
3. Rewrite `summariseOpinions` to request and parse strict JSON; build the index→id map.
4. Validate cited numbers; persist `body`, `clusters`, `commentIndexMap` via the existing `onConflictDoUpdate` (`ai.ts:114`).
5. Resolve indices→ids in `getPostDetail`; extend `CommunityNote` type.
6. Render clusters + citation chips in `CommunityNote.svelte`; add comment anchors/highlight in `CommentThread.svelte`.
7. Verify graceful fallback when JSON parsing fails.

## Testing & verification
- Unit: feed a thread with a clear majority + minority → clusters reflect the split; all cited numbers map to real ids.
- Unit: malformed model output → falls back to plain `body`, `clusters` null, no thrown error.
- Manual: post comments on a factual post, watch the note regenerate, click a citation chip → correct comment highlights.
- Confirm personal posts still get no note (`ai.ts:93`).

## Out of scope / future
- Sentiment scoring of clusters.
- Real-time note streaming.
- Showing cluster sizes as a bar (could imply a verdict - deliberately excluded).
