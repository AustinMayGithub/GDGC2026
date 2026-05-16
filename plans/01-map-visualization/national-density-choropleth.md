# National Post-Density Choropleth by Region

**Domain:** Map, visualization & navigation
**Complexity:** L
**Status:** Proposed

## Summary
In National mode, render the 16 NZ regions as a filled choropleth where each
region's shade reflects how much is happening there (post count, optionally
weighted by recency/engagement). The map becomes a true "control room"
heatmap of the country at a glance; clicking a region drills into Local mode
for that region. Markers stay on top for individual stories.

## Why it fits BirdsEye
project.md §1 calls the home page a *"'control room' view of the country"*
and §8 says national mode should render *"the 16 regional council
boundaries"* from GeoJSON. Today the national map only shows discrete
markers — a choropleth adds the missing aggregate layer. It also directly
serves §9.9 ("national feed needs a ranking rule") by giving a spatial
summary instead of an unscannable marker swarm, and ties to the
`regionId`-indexed `posts` table (`schema.ts:73,78`).

## User value
- Instantly see which parts of NZ are "loud" without reading every marker.
- A striking, screenshot-friendly demo visual.
- Region click is a natural shortcut into Local mode.

## Data model changes
None to the schema. Posts already store `regionId` (`schema.ts:73`); counts
are aggregated at query time.

## API / server changes
- New endpoint `src/routes/api/regions/density/+server.ts`:
  `GET` returns `{ density: { regionId: string; postCount: number;
  recentCount: number; score: number }[] }`. Implemented via a Drizzle
  `select ... groupBy(posts.regionId)` (the `posts_region` index at
  `schema.ts:78` makes this cheap), with `recentCount` filtered to the last
  24h. Add a `getRegionDensity()` helper in `src/lib/server/posts.ts`
  alongside `listPosts()`.
- Alternatively, derive density entirely client-side from the already-fetched
  `posts` array (group by `regionId`) — zero new endpoint, lower fidelity but
  L→M effort. Recommend client-side for the hackathon; the endpoint is the
  scalable version.

## UI / component changes
- **Region GeoJSON is a prerequisite.** `src/lib/data/nz-regions.ts` only
  has centroids + bboxes — there is no polygon geometry. Add
  `src/lib/data/nz-regions.geojson.ts` (or a static `.json` import)
  containing simplified region polygons keyed by the same `id`s. Source:
  Stats NZ regional council boundaries, simplified with `mapshaper` (§8
  already prescribes this exact pipeline).
- `src/lib/components/HomeMap.svelte`:
  - Add a `regionDensity` prop (`Record<string, number>` of region scores).
  - In the `load` handler, add a `regions` GeoJSON source and a
    `region-fill` fill layer **below** `post-point`, with `fill-color` a
    `match` / `interpolate` expression over a `score` feature property, and
    a faint `region-line` outline. Inject the score into each feature's
    properties before `addSource`.
  - Show these layers only in national view (toggle visibility using the
    existing `isNationalView()` helper at line 175, driven from
    `onMarkerPositionsChange`).
  - Add a `click` handler on `region-fill` that calls a new
    `onSelectRegion(regionId)` prop.
- `src/routes/+page.svelte`:
  - Compute/fetch density; pass `regionDensity` to `<HomeMap>`.
  - Implement `onSelectRegion` → set `selectedRegionId`, call
    `zoomToRegion()` (exists at line 372), switch `scope` to `local`.
- Add a small legend component (low→high shade scale) in `.map-area`.

## Dependencies & risks
- New asset: simplified NZ region GeoJSON. `mapshaper` is a build-time/CLI
  tool, not a runtime dependency — no `package.json` change. Sourcing and
  simplifying the geometry is the main effort and the schedule risk.
- Gotcha: keep the simplified polygons small (target <150 KB total) so the
  bundle stays light, per §8's "tiny payload" goal.
- Gotcha: choropleth fill must sit below markers and the `selected-radius`
  layers, and must not steal clicks from `post-point` — order layers
  carefully and let marker clicks win.
- Gotcha: region polygon `id`s must exactly match `NZ_REGIONS` ids
  (`nz-regions.ts:14`) or the join fails silently.

## Implementation steps
1. Source Stats NZ regional boundaries; simplify with `mapshaper`; export as
   a GeoJSON FeatureCollection with `id` matching `nz-regions.ts`.
2. Add it as a typed import in `src/lib/data/`.
3. Add `getRegionDensity()` to `src/lib/server/posts.ts` (or compute
   client-side from `posts`).
4. (If server route) add `src/routes/api/regions/density/+server.ts`.
5. In `HomeMap.svelte`, add `regions` source + `region-fill`/`region-line`
   layers below `post-point`, with score-driven colour.
6. Toggle region layers' visibility on national vs. local view.
7. Add the `region-fill` click handler + `onSelectRegion` prop.
8. Wire density + `onSelectRegion` in `+page.svelte`; add the legend.

## Testing & verification
- `npm run check` and `npm run build` pass.
- Manual: national view shows shaded regions; the densely-seeded demo region
  (Auckland or Wellington, §12) is clearly the darkest.
- Click a region; confirm it switches to Local mode zoomed to that region.
- Confirm region fill disappears in Local mode and markers remain clickable.
- Verify bundle size impact is acceptable (`npm run build` output).

## Out of scope / future
- Animated density transitions over time (see the time-scrubber plan).
- Sub-region (territorial authority) granularity.
- Per-category choropleths (factual vs. personal split).
