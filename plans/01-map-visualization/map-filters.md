# Map Filters (Category / Recency / Credibility)

**Domain:** Map, visualization & navigation
**Complexity:** S
**Status:** Proposed

## Summary
A compact filter bar on the home map that lets the reader narrow what
markers and headlines are shown: by category (personal / factual / all),
by recency (last hour / 24h / 7d / all), and by credibility status
(verified / disputed / contested / unvoted / all). Filtering is purely
client-side over the already-fetched `posts` array — no new fetch, instant
feedback.

## Why it fits BirdsEye
project.md §1 frames the map as a "control room" view of the country, and
§9.9 warns that "show all posts" does not scale even in a demo and the feed
"needs a ranking rule". Filters give the reader direct control over the
signal/noise tradeoff without changing the ranking model. They also make the
personal-vs-factual split (§4.6) and the credibility meter (§4.4) visible as
first-class navigation, not just per-post badges.

## User value
- Quickly answer "what factual news broke near me today?" vs. browsing
  everything.
- Surface only disputed/contested posts — a compelling judge demo of the
  credibility system.
- Reduces connector-line clutter (§8) by shrinking the candidate set the
  trending list draws from.

## Data model changes
None. All fields needed (`category`, `createdAt`, `verifyCount`,
`disputeCount`) already exist on `PostSummary` (`src/lib/types.ts:15`).

## API / server changes
None required. `GET /api/posts` (`src/routes/api/posts/+server.ts:44`)
already returns the full list; filtering happens in the client.

## UI / component changes
- New component `src/lib/components/MapFilters.svelte`: a glassy pill bar
  matching the `.scope-toggle` styling in `src/routes/+page.svelte:1079`.
  Three segmented controls + a "reset" affordance. Emits a `filters` object
  via an `onchange` prop.
- `src/routes/+page.svelte`:
  - Add `let filters = $state({ category: 'all', recency: 'all', credibility: 'all' })`.
  - Add a `filteredPosts` `$derived` between `rankedPosts` (line 255) and
    `visiblePosts` (line 263): `visiblePosts` becomes `$derived(applyFilters(rankedPosts, filters))`.
  - Reuse the existing `voteStatus` logic (mirror `HomeMap.svelte:231`) for
    the credibility filter so marker colours and the filter agree.
  - Place `<MapFilters>` inside `.map-area`, e.g. top-right under the header,
    only when `!composing && !viewingPost`.
- Because `mapPosts`, `trendingEntries`, and `selectedPosts` all derive from
  `visiblePosts`, markers, trending list, and connector lines update for
  free.

## Dependencies & risks
- No new libraries.
- Gotcha: filtering to zero posts must show the existing `.empty-state`
  (`+page.svelte:777`) — extend its condition to include an active-filter
  case with a "clear filters" button.
- Gotcha: a selected post that gets filtered out should not silently vanish
  mid-read — only apply filters to the map/list, never to `selectedPosts`
  when `selectedPostId` is set, or clear selection explicitly.

## Implementation steps
1. Create `MapFilters.svelte` with three segmented toggles and a typed
   `MapFilterState` interface; export it from a shared type or co-locate it.
2. In `+page.svelte`, add `filters` state and an `applyFilters(posts, f)`
   pure function (category equality; `createdAt` age window; `voteStatus`
   match).
3. Rename current `visiblePosts` derivation to feed through `applyFilters`.
4. Render `<MapFilters>` in `.map-area`, wired to update `filters` and bump
   `redrawTrigger`.
5. Extend the empty-state block to detect "filters hid everything" and offer
   a reset button.
6. Add a tiny active-filter count badge on the bar so users know filters are on.

## Testing & verification
- `npm run check` and `npm run build` pass.
- Manual: toggle each filter; confirm marker count, trending list, and
  connector lines all shrink consistently.
- Set credibility=disputed and confirm only red-status markers remain.
- Filter to empty and confirm the reset path restores all posts.

## Out of scope / future
- Server-side filtering for very large datasets.
- Saved/remembered filter preferences across sessions.
- A "region" filter — covered by the existing National/Local toggle.
