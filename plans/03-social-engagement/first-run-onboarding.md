# First-Run Onboarding Flow

**Domain:** Social, engagement & notifications
**Complexity:** S
**Status:** Proposed

## Summary
A short, dismissible first-run experience for new accounts: a 3-step overlay on
the map that explains the National/Local toggle, the Verify/Dispute credibility
meter, and the "New post" action - plus a one-time nudge to pick a home region.
Shown once, then never again.

## Why it fits BirdsEye
project.md §1 calls the map-of-NZ home page a "control room" view - a deliberately
*unfamiliar* interface. Connector lines, an impact-zone radius, and a
crowd-verification meter are not self-explanatory. §8 even flags the map as "the
riskiest UI". A judge or first-time visitor in a 48-hour demo needs to grasp the
signature interaction in seconds. Onboarding directly de-risks the demo and the
pitch. It also primes "Local mode" (§4.1) by prompting a region choice up front,
which the home page already caches in `localStorage` (`+page.svelte:209-229`).

## User value
- New users understand the map's two truth signals (crowd + AI) immediately.
- Removes the "what do I do here?" moment that kills first impressions.
- The region prompt makes Local mode useful from the first session.

## Data model changes
None. Completion state is stored client-side in `localStorage`
(key `birdseye:onboarded`), consistent with the existing
`birdseye:local-region` cache (`+page.svelte:51`). Optionally, an
`onboardedAt timestamp` column could be added to `users` later for cross-device
persistence - out of scope for 48h.

## API / server changes
None. This is a pure client feature.

## UI / component changes
- New `src/lib/components/OnboardingTour.svelte`:
  - A `$state` step index (0-2) over an array of `{ title, body, target }`.
  - A dimmed backdrop + a card; optionally a highlight ring positioned over the
    scope toggle / "New post" button using `getBoundingClientRect()`.
  - "Next", "Skip", and a final "Got it" button; on finish/skip, write
    `localStorage['birdseye:onboarded'] = '1'`.
  - Step 3 includes the region `<select>` (reuse `orderedRegions` from
    `+page.svelte:63-66`), wired to the existing `onRegionChange` handler.
- `src/routes/+page.svelte`:
  - In `onMount` (`+page.svelte:626-635`), after `fetchPosts()`, check the
    `localStorage` flag and set a `showOnboarding` `$state`.
  - Render `{#if showOnboarding}<OnboardingTour .../>{/if}` near the existing
    overlays (alongside `.empty-state`, `+page.svelte:777-784`).
  - Gate it behind `mapReady` so highlight rings can target real elements.

## Dependencies & risks
- No new packages.
- Risk: highlight rings drift if the header reflows on small screens
  (`+page.svelte:1597-1666` shows the header wraps). Mitigation: on viewport
  ≤ 980px, drop the rings and show plain centred cards (text-only tour).
- Risk: `localStorage` unavailable (private mode) - wrap reads/writes in
  try/catch exactly as `readCachedRegion`/`writeCachedRegion` already do
  (`+page.svelte:209-229`); on failure, simply skip the tour.
- Must not block `fetchPosts` or map interaction underneath - backdrop is a
  modal layer the user can dismiss instantly.

## Implementation steps
1. Build `OnboardingTour.svelte` with the step model and backdrop card.
2. Add a safe `localStorage` get/set helper pair (or reuse the pattern from
   `+page.svelte`).
3. In `+page.svelte` `onMount`, read the flag and set `showOnboarding`.
4. Render the tour conditionally, gated on `mapReady`.
5. Wire the region step to `onRegionChange`.
6. Add optional highlight rings for the scope toggle and "New post" button;
   disable them under 980px.
7. Persist the completed/skipped flag on exit.

## Testing & verification
- Fresh browser (cleared `localStorage`): tour appears once after the map loads.
- Reload: tour does not reappear.
- "Skip" on step 1 sets the flag and never shows again.
- Region step actually switches the map to Local mode and caches the region.
- Private-browsing mode: no crash; tour is simply skipped.
- Mobile width: text-only cards, no misaligned rings.

## Out of scope / future
- Server-side `onboardedAt` for cross-device persistence.
- Contextual coach-marks on the article view or compose panel.
- A replayable "tour" entry in the user menu.
