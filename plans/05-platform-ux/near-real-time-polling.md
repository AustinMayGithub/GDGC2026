# Near-real-time Updates via Polling

**Domain:** Performance, infrastructure, accessibility & UX
**Complexity:** M
**Status:** Proposed

## Summary
The home page fetches posts exactly once on mount (`+page.svelte:634
fetchPosts()` inside `onMount`) and never refreshes. New posts, votes and
comments from other users do not appear until a manual reload. Add lightweight
interval polling that refreshes the post list and the open article - without
WebSockets - so the map "feels alive" during a live demo.

## Why it fits BirdsEye
project.md §9.10 is explicit: "skip WebSockets - Optimistic UI on the voter's
own action + a refresh/poll is enough for 48h." §9 also wishes for a "trending /
what's loud right now" pulse. Polling is the sanctioned mechanism; this plan
implements it properly (visibility-aware, abortable, conflict-safe) rather than
a naive `setInterval`.

## User value
- New posts and updated credibility meters surface within seconds during a
  demo, without anyone touching the keyboard.
- Comment threads and the community note on an open article stay current.
- Makes the map feel like a live "control room" (§1) rather than a snapshot.

## Data model changes
None. Optionally add a cheap `GET /api/posts/since?ts=` style endpoint later;
not required for MVP polling.

## API / server changes
- No new endpoints required - polling reuses `GET /api/posts`
  (`src/routes/api/posts/+server.ts:44`) and `GET /api/posts/[id]`
  (`src/routes/api/posts/[id]/+server.ts`).
- Optional optimisation: add a lightweight `?fields=summary` or a `count`-only
  response to keep poll payloads small; defer unless the 300-row payload proves
  heavy.

## UI / component changes
- `src/routes/+page.svelte`
  - Add a polling controller: `setInterval` (~15 s) calling `fetchPosts()`.
    `fetchPosts` already aborts in-flight requests via `activeFetchController`
    (lines 320-322) and guards stale responses with `fetchRequestId` - reuse
    that; just add the interval and clear it in `onDestroy` (line 637).
  - Pause polling when `document.hidden` (visibility API) and when `composing`
    or `selectedPostLoading` is true, so a refresh never disrupts an open
    compose panel or yanks scroll. Resume on `visibilitychange`.
  - Avoid `resetFeedVisibility()` scroll-to-top on a *poll* refresh - only the
    initial/explicit fetch should reset scroll. Add a `silent` flag to
    `fetchPosts(silent = false)`.
  - When an article is open, separately poll `loadSelectedPost(selectedPostId)`
    (line 426) on the same tick so the credibility meter / note stay fresh.
- `src/lib/components/CommentThread.svelte` - optionally poll
  `GET /api/posts/[id]/comments` while the thread is visible; it already merges
  optimistic comments, so de-dupe by `id` when reconciling polled results.
- Add a subtle "updated" affordance (e.g. a brief pulse on the headline list)
  so users notice silent refreshes.

## Dependencies & risks
- No new dependencies.
- Risk: a poll overwriting `posts` while the user hovers/selects - mitigated;
  `fetchPosts` already re-validates `selectedPostId` against the new list
  (lines 331-334).
- Risk: poll churn moving markers mid-interaction - pause polling during
  `composing`/`viewingPost` as above.
- Risk: server load - 15 s interval × demo-scale users is trivial for Postgres;
  document the interval as tunable.

## Implementation steps
1. Add a `silent` parameter to `fetchPosts` that skips `resetFeedVisibility()`.
2. Add a polling interval in `onMount`, store its handle, clear it in
   `onDestroy`.
3. Gate the interval on `document.hidden`, `composing`, and active loads;
   wire a `visibilitychange` listener.
4. When `selectedPostId` is set and not loading, also refresh the open article
   each tick.
5. Add a subtle visual cue when polled data changes the list.
6. (Optional) add comment-thread polling with `id`-based de-dupe.

## Testing & verification
- Open two browser windows; post in one, confirm it appears in the other
  within one interval.
- Vote in one window; confirm the other's credibility meter updates.
- Confirm polling pauses when the tab is backgrounded and when composing.
- Confirm scroll position is preserved on a silent refresh.
- Confirm in-flight aborts: rapid scope toggles do not produce stale data.

## Out of scope / future
- Server-Sent Events / WebSockets (explicitly excluded by §9.10).
- Delta endpoints / cursor-based incremental sync.
- Push notifications.
