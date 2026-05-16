# "Stories Near Me" Proximity Search

**Domain:** Map, visualization & navigation
**Complexity:** M
**Status:** Proposed

## Summary
A "Near me" action that uses the browser geolocation already wired into the
home page to surface posts ordered by real distance from the user, shown as a
ranked proximity list (with distance labels like "850 m") and a map fly-to
that frames the user's surroundings. Distinct from Local mode (which zooms to
a whole region): this answers "what is happening *right here*, closest
first".

## Why it fits BirdsEye
project.md §1: *"news has a location and a blast radius"* — proximity is the
core promise. §3/§9.3 also describe proximity as a genuine pitch point
(proximity-weighted votes). The page already has `userLocation`,
`requestUserLocation()`, and a `distanceKm()` haversine helper
(`src/routes/+page.svelte:84,118,166`), plus the shared
`haversineMeters()`/`formatDistance()` in `src/lib/geo.ts:7,47`. This feature
assembles existing parts into an explicit, demo-friendly view.

## User value
- Direct answer to "what's near me right now", closest first.
- Distance labels make the blast-radius idea concrete.
- Works as a fast triage tool separate from region browsing.

## Data model changes
None. `posts.lng`/`posts.lat` exist (`schema.ts:70-71`); distance is computed
from the user's geolocation client-side.

## API / server changes
None for MVP — the full post list is already fetched and distance is computed
in the browser with `haversineMeters()` (`src/lib/geo.ts:7`).
Optional future: a `GET /api/posts/near?lng=&lat=` endpoint using PostGIS
`ST_DWithin` for large datasets.

## UI / component changes
- `src/routes/+page.svelte`:
  - Add a "Near me" button near the National/Local toggle (header-center,
    line 671) or as a third option, that calls `requestUserLocation(true)`
    and sets a new `nearMeActive` state.
  - Add a `nearbyPosts` `$derived`: when `nearMeActive` and `userLocation`
    is set, sort `visiblePosts` by `haversineMeters(userLocation.lng,
    userLocation.lat, p.lng, p.lat)` and attach a `distanceM`.
  - On activation, call `mapComponent.focusOnLocation(userLocation.lng,
    userLocation.lat, 5)` (method exists at `HomeMap.svelte:483`).
- New component `src/lib/components/NearbyList.svelte`: a panel listing the
  nearest ~10 posts, each with a `formatDistance()` badge, reusing the
  `HeadlineList` card visual language. Clicking an item calls
  `handleSelectPost`.
- Optional: a "you are here" marker on `HomeMap` — add a `userMarker`
  GeoJSON source + circle layer fed by a new `userLng/userLat` prop.

## Dependencies & risks
- No new libraries.
- Gotcha: geolocation is denied often (§9.6). When denied, fall back to the
  selected region's centre (`regionCenter()` at `+page.svelte:131`) and label
  the list "Near <region>" so the feature still works.
- Gotcha: `GEO_TIMEOUT_MS` is only 900ms (`+page.svelte:54`); a slow fix may
  time out. Reuse the existing cached `userLocation` if present before
  re-requesting.
- Privacy: never send the user's exact coordinates to the server in the MVP
  path — distance is computed locally.

## Implementation steps
1. Add `nearMeActive` state + a "Near me" trigger in the header.
2. Add the `nearbyPosts` derived list using `haversineMeters()`.
3. Build `NearbyList.svelte` with distance badges via `formatDistance()`.
4. On activation, request/reuse geolocation and call `focusOnLocation()`;
   fall back to region centre on denial.
5. Optionally add the "you are here" marker layer to `HomeMap.svelte`.
6. Ensure selecting a nearby post routes through `handleSelectPost`.

## Testing & verification
- `npm run check` and `npm run build` pass.
- Manual: allow geolocation, click "Near me"; confirm the list is sorted by
  ascending distance with correct labels and the map flies to the user area.
- Deny geolocation; confirm graceful fallback to region centre.
- Confirm clicking a list item opens the article view and frames its impact
  zone.

## Out of scope / future
- Server-side PostGIS `ST_DWithin` proximity endpoint.
- Push/notify when a new post appears within X km.
- Proximity-weighted voting (separate stretch feature, §9.3).
