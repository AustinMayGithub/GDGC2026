# AI Category Suggestion (Personal vs Factual)

**Domain:** AI & content intelligence
**Complexity:** S
**Status:** Proposed

## Summary
While composing a post, after the user has written a title and body, call OpenAI once to classify the draft as `personal` or `factual` and surface it as a *suggestion* in `CategoryPicker.svelte` — a soft hint ("This looks like a factual claim — pick a category"), never an auto-selection. The user always makes the final choice, preserving the §4.6 rule that category is chosen at posting time.

## Why it fits BirdsEye
project.md §4.6 warns that personal vs factual "drive different code paths, not just a label" and that miscategorisation breaks the product ("users will try to verify a garage-sale notice"). The category gate decides whether a post enters the voting + community-note pipeline at all. A suggestion reduces miscategorisation without removing user agency. It respects §4.5 fully: the AI classifies *post type*, never asserts whether the claim is true — and only the human-picked category flows to the server (`api/posts/+server.ts:63`).

## User value
- New users who don't grasp the personal/factual distinction get a gentle steer.
- Fewer garage-sale notices landing in the credibility pipeline → cleaner vote/heatmap data.
- The friction notice at `CategoryPicker.svelte:47` stays; the suggestion complements it.

## Data model changes
None. The suggestion is ephemeral compose-time UI; only the user's chosen `category` is persisted (`posts.category`, `schema.ts:69`).

## API / server changes
- New endpoint `src/routes/api/compose/classify/+server.ts` — `POST { title, body }` → `{ suggestion: 'personal' | 'factual', confidence: 'low' | 'high' }`.
- New function in `src/lib/server/ai.ts`: `classifyPostCategory(title, body)`.
  - Model: `gpt-4o-mini` (already the `NOTE_MODEL` constant, `ai.ts:7`), `max_tokens: 10`, `temperature: 0`, JSON-only response.
  - System prompt: define personal (notice/opinion/event, no truth claim) vs factual (a claim about something that happened) using the §2 glossary wording verbatim. Explicitly instruct: "classify the post *type* only; do not judge whether any claim is true."
  - Cost: ~300 input tokens, negligible. One call per compose session (debounced).
  - Caching: none needed; gate the call behind a minimum body length (e.g. 40 chars) and debounce.
  - Failure fallback: on error / no API key, return `{ suggestion: null }` and the UI shows no hint — compose works exactly as today.
- Auth-gate the endpoint with `locals.user`.

## UI / component changes
- `src/routes/compose/+page.svelte`: add `categorySuggestion` `$state`. In a `$effect` debounced on `title`/`body` (or on body blur), call `/api/compose/classify` once both fields are non-trivial. Pass the suggestion into `CategoryPicker`.
- `src/lib/components/CategoryPicker.svelte`: add an optional `suggestion` prop. When set and the user hasn't chosen yet, render a subtle hint row ("Looks like a factual post" / "Looks like a community notice") above or near the relevant card, styled like `.factual-notice` (line 107) but neutral-toned. Clicking the hint selects that category via the existing `onchange`.

## Dependencies & risks
- No new dependencies.
- Risk: a wrong suggestion could mislead. Mitigate — present as "looks like…", never pre-select, and only show `high` confidence hints.
- Risk: extra API call per compose. Mitigate with debounce + min-length gate; cost is trivial.

## Implementation steps
1. Add `classifyPostCategory` to `src/lib/server/ai.ts` with a strict JSON-output prompt.
2. Create `src/routes/api/compose/classify/+server.ts`.
3. In `compose/+page.svelte`, add debounced classification logic and `categorySuggestion` state.
4. Extend `CategoryPicker.svelte` with a `suggestion` prop and a hint row.
5. Ensure the server still independently validates `category` at `api/posts/+server.ts:80`.

## Testing & verification
- Unit: `classifyPostCategory` returns `factual` for "Power outage on Queen St", `personal` for "Garage sale this Saturday".
- Manual: type each kind of post → correct hint appears; clicking it selects the category; choosing manually overrides the hint.
- Confirm no API key → no hint, compose unaffected.

## Out of scope / future
- Auto-selecting the category (deliberately excluded — violates the §4.6 "user chooses" principle).
- Suggesting title/body rewrites (covered by a separate plan).
- Region suggestion from body text.
