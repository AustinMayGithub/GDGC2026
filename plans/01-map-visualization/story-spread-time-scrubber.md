# Story-Spread Time Scrubber

**Domain:** Map, visualization & navigation
**Complexity:** XL
**Status:** Proposed

## Summary
A timeline scrubber over the national map that replays how news spread across
New Zealand: drag the handle (or press Play) and markers fade in at the
moment each post was created, with optional "ripple" growth of impact circles
and a cumulative engagement build-up. It turns the static map into a
time-lapse of the country's news, ending at "now".

## Why it fits BirdsEye
project.md §9 "Ideas worth adding if time allows" lists this directly:
*"Time scrubber — replay how a story spread across the map. Great demo
moment; pure frontend if data has timestamps. Stretch."* Every post already
carries `createdAt` (`schema.ts:75`, surfaced on `PostSummary`
`src/lib/types.ts:25`), so the data exists. It is the strongest "wow"
visualisation for the pitch and reinforces §1's blast-radius theme over time.

## User value
- A memorable, narrative demo moment — the country's news unfolding live.
- Lets a viewer understand the *sequence* of events, not just the snapshot.
- Makes a small seeded dataset (15–20 posts, §10) feel dynamic.

## Data model changes
None for MVP — `createdAt` per post is sufficient.
Optional future enrichment: a `post_events` table
`(id, post_id, kind[created|comment|vote|reaction], created_at)` so the
scrubber can also replay engagement accumulation, not just post appearance.
Comments/votes/reactions already have `createdAt` columns
(`schema.ts:96,115,133`) and could be unioned instead of a new table.

## API / server changes
- MVP: none — `GET /api/posts` already returns `createdAt`; the scrubber
  filters client-side.
- Optional (engagement replay): a `GET /api/posts/timeline` endpoint, or
  extend `getPostDetail`/`listPosts` in `src/lib/server/posts.ts` to return
  per-post comment/vote timestamps. Keep this out of the MVP slice.

## UI / component changes
- New component `src/lib/components/TimeScrubber.svelte`: a bottom-of-map
  control bar with a range `<input>`, Play/Pause, speed selector, and a
  current-time label. Emits a `currentTime` (epoch ms) via an `onchange`
  prop and animates the handle on Play via `requestAnimationFrame`.
- `src/routes/+page.svelte`:
  - Add `scrubberActive` and `scrubberTime` state.
  - Add a `timelinePosts` `$derived`: when active, filter `visiblePosts` to
    `new Date(p.createdAt).getTime() <= scrubberTime`.
  - Feed `timelinePosts` into `mapPosts` (line 298) while the scrubber is
    active, so `HomeMap`, `HeadlineList`, and `ConnectorLines` all replay
    together.
  - Render `<TimeScrubber>` in `.map-area` only when `!composing &&
    !viewingPost`.
- `src/lib/components/HomeMap.svelte`:
  - Markers already re-render from the `posts` prop via `syncPostLayers()`
    (line 314) — feeding fewer posts replays appearance for free.
  - Add a CSS/expression fade-in: give each feature an `ageAtTime` property
    and drive `circle-opacity` so a just-appeared marker eases in over
    ~400ms rather than popping. Optionally drive a brief radius "ripple".
  - Guard `fitToPosts`/auto-fit so the camera does not jump every frame
    while the scrubber runs — freeze the viewport during playback.

## Dependencies & risks
- No new libraries (pure frontend, per §9).
- **Schedule risk: XL.** This interacts with the connector lines (§8, the
  named biggest schedule risk) — markers appearing/disappearing every frame
  forces `ConnectorLines.svelte` recomputes via `redrawTrigger`
  (`+page.svelte:91`). Throttle scrubber-driven updates to ~10 fps, not
  every rAF, to keep connector recomputation affordable.
- Gotcha: do not let the scrubber fight the National/Local toggle, trending
  dropdown, or post selection — disable or reset the scrubber when any of
  those activate.
- Gotcha: the auto "zoom out → national" behaviour
  (`+page.svelte:397-410`) must be suspended during playback.
- Recommendation: ship the post-appearance replay first; treat engagement
  replay as a separate follow-up.

## Implementation steps
1. Build `TimeScrubber.svelte` (range input, Play/Pause, speed, time label,
   rAF playback loop).
2. Add `scrubberActive`/`scrubberTime` state + `timelinePosts` derived in
   `+page.svelte`; route it into `mapPosts` when active.
3. Throttle scrubber updates to ~10 fps and bump `redrawTrigger` only on
   throttled ticks.
4. Add marker fade-in (and optional ripple) in `HomeMap.svelte` driven by an
   `ageAtTime` feature property.
5. Freeze auto-fit / auto-national behaviour while the scrubber is active.
6. Disable/reset the scrubber when composing, viewing a post, or opening
   trending; clear it on National/Local switch.
7. Compute the scrubber's min/max bounds from the oldest/newest `createdAt`.

## Testing & verification
- `npm run check` and `npm run build` pass.
- Manual: with seeded posts spanning several days, drag the scrubber and
  confirm markers appear in chronological order; pressing Play animates the
  build-up smoothly.
- Confirm connector lines and headline list stay consistent with visible
  markers at each frame.
- Confirm the camera does not jump during playback and the auto-national
  zoom-out is suppressed.
- Confirm leaving and re-entering the scrubber resets cleanly.

## Out of scope / future
- Engagement-accumulation replay (comments/votes over time) — needs the
  optional timeline endpoint.
- Per-story spread animation on the article-view `ImpactMap`.
- Exporting the replay as a shareable video/GIF.
