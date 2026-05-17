# Accessibility Audit & Fixes

**Domain:** Performance, infrastructure, accessibility & UX
**Complexity:** M
**Status:** Proposed

## Summary
A focused accessibility pass over the existing UI: fix concrete issues already
visible in the code, add keyboard support to custom interactive elements,
replace native `window.prompt`/`alert` dialogs, and verify colour contrast on
the credibility meter and map markers. The app is small enough that one
deliberate sweep covers most of WCAG 2.1 AA.

## Why it fits BirdsEye
project.md does not call out accessibility explicitly, but §1 frames BirdsEye as
a public "community news" platform and §4.7 treats a bad public impression as
"demo-ending". A judge using a screen reader or keyboard hitting an
unannounced `window.prompt` (`+page.svelte:472`) is exactly that kind of
failure. This is low-risk polish that raises the perceived quality bar.

## User value
- Keyboard and screen-reader users can navigate the map, headline list,
  compose panel and article view.
- No jarring native `prompt()`/`alert()` interruptions.
- Sufficient colour contrast for the credibility meter and status markers.

## Data model changes
None.

## API / server changes
None.

## UI / component changes
Concrete issues found in the code:
- `src/routes/+page.svelte:660-669` - the logo is a `<div role="button">` with
  an `onkeydown` Enter handler but no Space handler and a non-descriptive
  child `<img alt="logo">`. Replace with a real `<a href="/">` (semantic,
  focusable, both keys free) and give the logo image an empty `alt=""` plus a
  visually-hidden "BirdsEye home" label, or `alt="BirdsEye"`.
- `src/routes/+page.svelte:472 reportSelectedPost` uses `window.prompt` +
  `alert`. Replace with an accessible in-panel form / modal (focus-trapped,
  `aria-labelledby`, Escape to close). `CommentThread.svelte` already has an
  inline report form pattern (`reportingId`/`reportReason` state) - reuse it.
- Map markers are `circle` layers with no keyboard path; the headline list and
  trending dropdown are the keyboard-accessible route to a post - confirm every
  post reachable on the map is also reachable in a list, and that
  `HeadlineList.svelte` items are real `<button>`/`<a>` elements with visible
  focus rings.
- Scope toggle (`+page.svelte:679-696`) uses `aria-pressed` - good; verify the
  `aria-busy` region and that the `.toggle-indicator` movement is not the only
  state cue (text weight change at line 1126 covers this - confirm).
- `aside` panels (compose `+page.svelte:908`, post `+page.svelte:798`) appear
  via `transition:fly`. When opened, move focus into the panel; when closed,
  return focus to the trigger. Add `aria-modal`-style focus handling or at
  least programmatic focus on the panel heading.
- Add a "skip to main content" link in `src/routes/+layout.svelte`.
- Respect `prefers-reduced-motion` for the `fly` transitions and the spinner
  (`+page.svelte:1242` `@keyframes spin`) - wrap motion in a media query in
  `app.css`.
- Form fields: confirm every `input`/`textarea`/`select` has an associated
  `<label>` - compose fields use `field-label`/`for` (good); the region
  `<select>` at `+page.svelte:707` has no label - add a visually-hidden one.
- Image `alt` text: post header images render `alt=""` (`+page.svelte:836`) -
  acceptable as decorative, but confirm intentional; the article has a real
  `<h1>` title nearby.
- Colour contrast: the credibility meter and the marker status colours
  (`HomeMap.svelte:582-595` greens/reds/yellows) - verify text-on-colour and
  adjacent-colour contrast; add a non-colour cue (icon/label) to verify vs
  dispute since red/green alone fails for colour-blind users.

## Dependencies & risks
- Optional dev dependency: `axe-core` or `@axe-core/playwright` for automated
  checks; can also run the browser Lighthouse/axe extension manually with no
  dependency.
- Risk: focus-trap behaviour for the panels is fiddly - keep it minimal
  (focus on open, restore on close) rather than a full trap if time is short.

## Implementation steps
1. Run axe / Lighthouse against `/`, `/post/[id]`, `/auth/login`,
   `/auth/signup`, `/profile/[id]`; record findings.
2. Replace the logo `div` with a semantic link; fix its `alt`.
3. Replace `window.prompt`/`alert` reporting with an accessible in-panel form.
4. Add labels to the region `select` and any other unlabelled controls.
5. Add focus management to the compose/post `aside` panels and a skip link to
   the layout.
6. Add a `prefers-reduced-motion` block in `app.css`.
7. Add a non-colour cue (icon/text) to verify/dispute UI; verify contrast.
8. Re-run the audit; confirm no critical/serious violations remain.

## Testing & verification
- axe / Lighthouse accessibility score on the key routes, before/after.
- Keyboard-only walkthrough: post → vote → comment → report → back to map.
- Screen-reader spot check (NVDA/VoiceOver) of the article view and compose.
- Confirm `prefers-reduced-motion` disables panel/spinner animation.

## Out of scope / future
- Making individual map markers directly keyboard-focusable (the list is the
  accessible equivalent).
- Full WCAG AAA compliance.
- Internationalisation / RTL.
