# Lazy-load & Code-split the MapLibre Bundle

**Domain:** Performance, infrastructure, accessibility & UX
**Complexity:** S
**Status:** Proposed

## Summary
The MapLibre GL JS client chunk is ~800 kB and the production build warns about
it. The map JS is already dynamically imported (`HomeMap.svelte:510`), but the
heavy `maplibre-gl/dist/maplibre-gl.css` is **statically** imported at
`HomeMap.svelte:2`, and the same pattern likely repeats in `ImpactMap.svelte`.
This plan finishes the job: defer all MapLibre code + CSS so the first paint of
the header, headline list and trending dropdown is not blocked on 800 kB, and
make the manual chunking explicit so the warning disappears.

## Why it fits BirdsEye
project.md §8 calls the map "the visual centrepiece and the riskiest UI" and §5
picks MapLibre specifically for GPU rendering. A heavy initial bundle hurts the
first impression for hackathon judges on conference Wi-Fi. §10 lists no perf
budget, but a fast shell that reveals the map progressively directly serves the
"control room" first-impression goal in §1.

## User value
- Faster time-to-interactive for the header, sign-in links and headline shell.
- The page is usable (and the empty-state / error banner readable) before the
  800 kB map engine finishes downloading.
- Lower data cost on mobile, where many demo viewers will be.

## Data model changes
None.

## API / server changes
None — this is a build/client-side change. Optionally tune `vite.config.ts`:
add `build.rollupOptions.output.manualChunks` to isolate `maplibre-gl` into a
named `maplibre` chunk so its load is observable and cacheable separately.

## UI / component changes
- `src/lib/components/HomeMap.svelte`
  - Remove the static `import 'maplibre-gl/dist/maplibre-gl.css'` at line 2.
  - In the existing `onMount` (line 509), after `await import('maplibre-gl')`,
    also `await import('maplibre-gl/dist/maplibre-gl.css')` (Vite supports
    dynamic CSS import) — or inject a `<link>` to the CSS lazily.
  - Add a lightweight skeleton/placeholder shown until `mapReady` so layout
    does not jump; `+page.svelte:729` already has a `map-loading` spinner —
    reuse that styling for a pre-load state.
- `src/lib/components/ImpactMap.svelte` — apply the identical pattern (verify
  it does not statically import maplibre or its CSS; if it does, defer them).
- `src/routes/post/[id]/+page.svelte:12` imports `ImpactMap` — ensure that
  import does not transitively pull maplibre into the page's eager bundle
  (the component file's own dynamic import handles this once fixed).
- `vite.config.ts` — add `manualChunks` (see above).

## Dependencies & risks
- No new dependencies.
- Risk: dynamic CSS import timing — the map may render one frame unstyled.
  Mitigated by keeping the placeholder until `onMapReady` fires
  (`+page.svelte:389 handleMapReady`).
- Risk: SSR — MapLibre is browser-only; the dynamic import already lives in
  `onMount`, so SSR is unaffected. Verify `ImpactMap` does the same.

## Implementation steps
1. In `HomeMap.svelte`, delete the static CSS import (line 2).
2. Inside `onMount`, `await import('maplibre-gl/dist/maplibre-gl.css')`
   immediately before `await import('maplibre-gl')`.
3. Repeat for `ImpactMap.svelte`.
4. Add a `manualChunks` entry in `vite.config.ts` mapping `maplibre-gl` to a
   `maplibre` chunk.
5. Add/confirm a placeholder element in `HomeMap.svelte` shown until `mapReady`.
6. Run `npm run build`; confirm the chunk-size warning for maplibre is gone or
   intentionally suppressed via `build.chunkSizeLimit`.

## Testing & verification
- `npm run build` and inspect the build output: a separate `maplibre-*.js`
  chunk, no eager maplibre in the entry chunk.
- DevTools Network throttled to "Fast 3G": header + headline list paint before
  the maplibre chunk finishes.
- Smoke test: home map, compose map and article `ImpactMap` all still render
  and interact correctly.
- `npm run check` passes.

## Out of scope / future
- Replacing MapLibre with a lighter renderer.
- Pre-rendering a static NZ outline image as an instant placeholder behind the
  live map.
