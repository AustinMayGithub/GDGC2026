# Trending Pulse on Hot Markers

**Domain:** Map, visualization & navigation
**Complexity:** S
**Status:** Proposed

## Summary
An animated radiating "pulse" ring on the small number of markers that are
trending right now (high recent engagement). The pulse is a second MapLibre
circle layer whose radius and opacity animate each frame via
`requestAnimationFrame`, making the hottest stories visibly "breathe" on the
national map.

## Why it fits BirdsEye
project.md §9 "Ideas worth adding if time allows" explicitly lists
*"Trending / 'what's loud right now' - a pulse on markers with high recent
activity. Cheap, makes the map feel alive in the demo."* The app already
computes a `trendScore` and a top-6 `trendingEntries` list in
`src/routes/+page.svelte:249-283`; this feature simply renders that existing
signal on the map itself.

## User value
- The map feels alive and draws the eye to what matters during the demo.
- Reinforces the "blast radius" theme (§1): loud stories literally pulse
  outward.
- Zero extra clicks - ambient signal.

## Data model changes
None. Trending is derived client-side from existing engagement counts.

## API / server changes
None.

## UI / component changes
- `src/lib/components/HomeMap.svelte`:
  - Add a `trendingPostIds: string[]` prop (passed from `+page.svelte`
    `trendingPosts.map(p => p.id)`).
  - In `postsToFeatures()` (line 253) add a boolean `trending` property to
    each feature.
  - Add a new `post-pulse` circle layer **below** `post-point` in the `load`
    handler (line 532). Filter it to `['==', ['get','trending'], true]`.
  - In `onMount`, after the map loads, start a `requestAnimationFrame` loop
    that drives a 0→1→0 eased value and calls
    `m.setPaintProperty('post-pulse','circle-radius', ...)` and
    `'circle-opacity'`. Cancel the loop in `onDestroy` (line 672) alongside
    `map.remove()`.
- `src/routes/+page.svelte`: pass `trendingPostIds={trendingPosts.map(p => p.id)}`
  into `<HomeMap>` (line 735).

## Dependencies & risks
- No new libraries - MapLibre paint-property updates are cheap.
- Risk: an always-running rAF loop costs battery. Mitigate by only running
  the loop while at least one trending marker exists, and pausing it when the
  page is hidden (`document.visibilitychange`).
- Gotcha: keep the pulse layer's `circle-pitch-alignment`/stroke minimal so
  it does not capture clicks - `post-point` must stay the click target.
- Gotcha: cap pulsing markers to the top ~3–4 of `trendingEntries` so the map
  does not look noisy.

## Implementation steps
1. Add `trendingPostIds` prop + `trending` feature property in `HomeMap.svelte`.
2. Add the `post-pulse` circle layer with a colour matching the marker
   `status` palette (lines 582-595) at low opacity.
3. Implement the rAF pulse loop (period ~1.6s, eased sine), store the
   `rafId`, cancel it in `onDestroy`.
4. Pause/resume the loop on `visibilitychange` and when no trending markers
   exist.
5. Wire the prop from `+page.svelte`.

## Testing & verification
- `npm run check` and `npm run build` pass.
- Manual: load the national map with seeded data; confirm 3–4 high-engagement
  markers pulse and the rest do not.
- Confirm clicking a pulsing marker still opens the article view.
- Confirm switching tabs away and back does not leave a runaway rAF loop
  (check CPU stays flat when hidden).

## Out of scope / future
- Per-marker pulse speed scaled to engagement intensity.
- Sound or haptic cues.
- Pulse on the article-view `ImpactMap`.
