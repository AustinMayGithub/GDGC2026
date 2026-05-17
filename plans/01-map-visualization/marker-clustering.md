# MapLibre Marker Clustering

**Domain:** Map, visualization & navigation
**Complexity:** M
**Status:** Proposed

## Summary
Enable MapLibre's built-in GeoJSON-source clustering on the home-map `posts`
source so that multiple posts in one city collapse into a single numbered
cluster bubble at low zoom. Clicking a cluster zooms in to expand it;
individual markers reappear at higher zoom. This stops dense areas
(Auckland, Wellington) from rendering as an unreadable blob of overlapping
dots.

## Why it fits BirdsEye
project.md §8 "Marker clustering" states plainly: *"Multiple posts in one
city will overlap. MapLibre's built-in GeoJSON source clustering handles
this - enable it from the start."* It is also listed under §10 Nice-to-have.
The current `posts` source (`src/lib/components/HomeMap.svelte:564`) has no
clustering, so seeded demo data (15–20 posts, §10) concentrated in two
regions will overlap badly.

## User value
- A readable national map even with dense demo seeding.
- Cluster counts give an at-a-glance "how busy is this city" read.
- Click-to-zoom is an intuitive drill-down that complements the
  National/Local toggle.

## Data model changes
None.

## API / server changes
None.

## UI / component changes
All changes in `src/lib/components/HomeMap.svelte`:
- In the `m.addSource('posts', ...)` call (line 564) add
  `cluster: true`, `clusterRadius: 46`, `clusterMaxZoom: 9`.
- Add three layers in the `load` handler:
  1. `clusters` - circle layer filtered to `['has','point_count']`,
     sized/coloured by `point_count` via a `step` expression, styled to match
     the app's glassy palette.
  2. `cluster-count` - symbol layer with `text-field: ['get','point_count_abbreviated']`.
  3. Keep the existing `post-point` layer but add filter
     `['!', ['has','point_count']]` so it only draws unclustered points.
- Add a `click` handler on `clusters` that calls
  `source.getClusterExpansionZoom()` and `m.easeTo()` to that zoom.
- Add `mouseenter`/`mouseleave` cursor handlers on `clusters` (mirror
  lines 658-664).
- **Important:** clustering breaks `getMarkerScreenPos()` (line 425) for any
  post currently inside a cluster - the connector line would point at a
  marker that is not rendered. In `getMarkerScreenPos`, when the post's
  point is clustered at the current zoom, return the *cluster's* screen
  position instead (query the cluster feature near that lng/lat), or return
  `null` so `ConnectorLines.svelte:47` skips it gracefully (it already
  `continue`s on null).
- The `selected-radius` and `compose-*` sources stay unclustered - only
  `posts` clusters.

## Dependencies & risks
- No new libraries - clustering is native to MapLibre's GeoJSON source.
- **Schedule risk: connector-line interaction.** This is the real cost. The
  connector lines (project.md §8, the named biggest schedule risk) assume
  every post has a stable on-map pixel. Decide the policy up front: either
  (a) connector skips clustered posts, or (b) connector points to the
  cluster. Option (a) is the safe, fast choice.
- Gotcha: `setData` on a clustered source recomputes clusters - the existing
  `syncPostLayers()` (line 314) still works, no change needed.
- Gotcha: trending pulse / selected-marker styling (`selected`, `hovered`
  feature props) does not propagate to cluster bubbles; a selected post
  inside a cluster will not look selected. Acceptable for MVP.

## Implementation steps
1. Add `cluster`/`clusterRadius`/`clusterMaxZoom` to the `posts` source.
2. Add `clusters` + `cluster-count` layers; add `['!',['has','point_count']]`
   filter to `post-point`.
3. Add the cluster click-to-expand handler and cursor handlers.
4. Update `getMarkerScreenPos()` to return `null` (or the cluster position)
   for clustered posts so connector lines stay correct.
5. Verify `fitToBbox`/`fitToPosts` still frame the data sensibly.
6. Tune `clusterRadius` against the seeded Auckland/Wellington density.

## Testing & verification
- `npm run check` and `npm run build` pass.
- Manual: seed several posts in one city; confirm they cluster at national
  zoom and a numbered bubble shows the count.
- Click a cluster; confirm it expands and individual markers appear.
- Confirm connector lines do not draw to a missing marker (no stray lines
  ending in empty space).
- Confirm Local mode (region zoom) shows unclustered markers as expected.

## Out of scope / future
- Custom HTML cluster bubbles with category breakdown.
- Spiderfy (fan-out) for clusters that will not separate by zoom.
- Cluster-aware selection highlighting.
