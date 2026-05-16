# Comment Toxicity Pre-Warning

**Domain:** AI & content intelligence
**Complexity:** S
**Status:** Proposed

## Summary
Before a comment is submitted, run a fast client-triggered moderation check and, if the text is borderline or flagged, show a soft "this may break community guidelines — review before posting" warning inline. The user can still edit or send; the existing hard server-side moderation gate in `src/routes/api/posts/[id]/comments/+server.ts:27` remains the real enforcement. This catches heated comments early, reduces rejected submissions, and improves the demo's "feels considered" polish.

## Why it fits BirdsEye
project.md §4.7 makes moderation a hard MVP requirement — "a judge or bystander posting hateful content that goes live is a demo-ending failure." Today moderation only fires *after* the user hits submit (`comments/+server.ts:27`), so a flagged comment produces a blunt error toast (`CommentThread.svelte:65`). A pre-warning is purely a safety/UX layer: it never declares a post true or false and never touches the credibility signal, so it is fully compatible with §4.5 — the AI here only classifies the *commenter's own draft* for policy safety, not the truth of any claim.

## User value
- Fewer dead-end "your comment was flagged" errors after the user has typed a full comment.
- A gentle nudge to cool down rather than a punitive block — keeps discussion civil, which directly improves the quality of input the community note summarises.
- The credibility verdict stays 100% crowd-owned; this only governs conduct.

## Data model changes
None. (Optional, out of scope: a `moderation_flag` boolean on `comments` if you later want analytics — not needed for this feature.)

## API / server changes
- New endpoint `src/routes/api/moderate/+server.ts` — `POST { text }` → `{ status: 'ok' | 'warn' }`.
  - Reuses `moderateText` from `src/lib/server/ai.ts:33` but needs the *score*, not just the boolean. Add a sibling export `moderationCheck(text): Promise<{ flagged: boolean; warn: boolean }>` that calls `client.moderations.create` (model `omni-moderation-latest`, already used at `ai.ts:38`) and treats any `category_scores` value above a soft threshold (~0.4) as `warn`, full flag as `flagged`.
  - Model/cost: OpenAI moderation endpoint is free and fast (~100-200ms). No token budget concern.
  - Failure fallback: on API error or missing `OPENAI_API_KEY`, return `{ status: 'ok' }` (mirrors `ai.ts:43-44` dev-mode behaviour) — never block the user on the soft check.
  - Require `locals.user` (auth) and cap input length to 2000 chars to match the comment limit.
- Debounce: the client only calls this on blur or just before submit, not per keystroke, to avoid hammering the endpoint.

## UI / component changes
- `src/lib/components/CommentThread.svelte`: in `submitComment` (line 38), before the optimistic insert, `await` the `/api/moderate` check. If `warn`, set a new `$state` `toxicityWarning` and render a dismissible inline banner above the compose box (line 177). A second submit click within the warning state proceeds normally. Add minimal styling consistent with the existing `.error-text` / `.report-panel` look.
- Optional: same pattern in `src/routes/compose/+page.svelte` `handleSubmit` (line 75) for post bodies — small extra win, list as future if time-boxed.

## Dependencies & risks
- No new dependencies (OpenAI SDK already imported in `ai.ts`).
- Risk: extra ~200ms latency before comment submit. Mitigate by running the check in parallel with nothing blocking and showing the optimistic comment only after `ok`.
- Risk: false positives annoying users — keep it a *soft* warning, never a block, and tune the threshold conservatively (0.4+).

## Implementation steps
1. Add `moderationCheck` to `src/lib/server/ai.ts` returning `{ flagged, warn }` from `category_scores`.
2. Create `src/routes/api/moderate/+server.ts` with an auth-gated `POST` handler.
3. In `CommentThread.svelte`, add `toxicityWarning` state and call the endpoint at the top of `submitComment`.
4. Render the dismissible warning banner; allow a confirmed re-submit to bypass it.
5. Verify the hard server gate at `comments/+server.ts:27` still runs regardless.

## Testing & verification
- Unit: `moderationCheck` returns `warn` for borderline text, `flagged` for clearly abusive text, `ok` when no API key.
- Manual: type a mildly heated comment → see warning; dismiss/resend → posts. Type clearly abusive text → warning, then server still rejects with 422.
- Confirm a network failure on `/api/moderate` does not block legitimate comments.

## Out of scope / future
- Persisting moderation scores for analytics.
- Pre-warning on post compose (mention as a quick follow-up).
- Per-category guidance ("this reads as a personal attack on the author").
