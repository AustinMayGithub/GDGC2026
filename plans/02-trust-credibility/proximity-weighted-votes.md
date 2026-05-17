# Proximity-Weighted Votes

**Domain:** Trust, credibility & anti-abuse
**Complexity:** M
**Status:** Proposed

## Summary
Make the credibility meter weight each vote by how close the voter was to the
post's location. A voter standing in the centre of the impact zone counts more
than one who is only barely inside it. The raw verify/dispute counts stay
visible, but the headline percentage is the *weighted* score.

## Why it fits BirdsEye
This is the named stretch goal in `project.md` §9.3 ("proximity-weighted votes -
a voter near the impact zone counts for more than someone across the country")
and is called a "genuinely novel pitch point". It deepens the core BirdsEye
thesis from §1 - that "news has a location and a blast radius" - by making the
*credibility signal itself* spatial, not just the map. The location data needed
already exists: `post_votes.voter_lng` / `voter_lat` are populated on every vote
(`schema.ts:94-95`, written in `vote/+server.ts:59`).

## User value
A reader trusts a post more when the people closest to the event back it. The
weighted meter resists a thin ring of barely-inside voters being treated the
same as eyewitnesses at ground zero, and gives the demo a memorable "the crowd
nearest the news counts most" story.

## Data model changes
None. `post_votes.voterLng` / `voterLat` (`schema.ts:94-95`) already store voter
location; weighting is computed on read. Optionally add a generated/cached
`weight` column later, but not required for MVP - see Out of scope.

## API / server changes
- New helper `voteWeight(distanceM, radiusM)` in `src/lib/geo.ts` - returns a
  multiplier in `[0.2, 1.0]`. Suggested curve: `1 - 0.8 * (distance / radius)`
  clamped, so the centre is `1.0` and the edge is `0.2`. Pure function, shared
  client/server (the file is deliberately outside `$lib/server`, `geo.ts:1-2`).
- `src/lib/server/posts.ts`: add `getWeightedScore(postId)` that selects
  `vote, voterLng, voterLat` rows for the post (mirrors `getVotePoints`,
  `posts.ts:294-313`), computes per-vote weight via `haversineMeters`
  (`geo.ts:7`) against `posts.lng/lat`, and returns
  `{ weightedVerify, weightedDispute, weightedPct, rawVerify, rawDispute }`.
- `getPostDetail` (`posts.ts:206`) - add `weightedVerify` / `weightedDispute` /
  `weightedPct` to the returned `PostDetail`.
- `vote/+server.ts` - after inserting the vote (`vote/+server.ts:54-60`),
  return the weighted figures in the JSON response alongside the existing
  `verifyCount` / `disputeCount` (`vote/+server.ts:77`).

## UI / component changes
- `src/lib/components/CredibilityMeter.svelte` - the bar currently uses
  `verifyPct = verifyCount / total` (`CredibilityMeter.svelte:30`). Drive the
  bar width from `weightedPct` instead, and keep the raw `{verifyCount}
  verified · {disputeCount} disputed` line (`CredibilityMeter.svelte:142-144`)
  as the honest underlying count. Add a small tooltip/caption: "Weighted by how
  close each voter was to the story."
- Update `VoteResult` interface (`CredibilityMeter.svelte:5-10`) and
  `PostDetail` in `src/lib/types.ts:58-66` with the new fields.

## Dependencies & risks
- No new packages - pure haversine math, already in `geo.ts`.
- Risk: with very few votes the weighted number looks arbitrary. Mitigation:
  fall back to the raw percentage when `total < 3`.
- Risk: users may find a weighted percentage that disagrees with the raw count
  confusing. Mitigation: always show both, label the weighting clearly.
- The location gate (`vote/+server.ts:45`) already guarantees every vote is
  inside the radius, so weights are always in a sane range.

## Implementation steps
1. Add `voteWeight()` to `src/lib/geo.ts` with the clamped linear curve and a
   unit-test-friendly signature.
2. Add `getWeightedScore()` to `src/lib/server/posts.ts`; reuse the row query
   shape from `getVotePoints`.
3. Extend `PostDetail` (`types.ts`) and `getPostDetail` to include weighted
   fields.
4. Update the vote endpoint response to include weighted figures.
5. Switch `CredibilityMeter.svelte` bar/percentage to `weightedPct`, add the
   caption, keep raw counts.
6. Add the `total < 3` raw-fallback in the component's `$derived`.

## Testing & verification
- Unit-test `voteWeight()`: centre → ~1.0, edge → ~0.2, beyond radius clamps.
- Seed a post with verify votes clustered at the centre and dispute votes near
  the edge; confirm `weightedPct` skews higher than the raw percentage.
- Confirm the raw counts displayed still equal a plain `count(*)`.
- Confirm `total < 3` shows the raw percentage.

## Out of scope / future
- Persisting a cached `weight` column on `post_votes` for large-post
  performance.
- A PostGIS `geography` distance query instead of in-app haversine (the schema
  is currently plain `doublePrecision`, `schema.ts:70-71`).
- Visualising weight on the heatmap (dot size = weight).
