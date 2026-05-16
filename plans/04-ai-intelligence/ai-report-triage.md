# AI-Assisted Report Triage

**Domain:** AI & content intelligence
**Complexity:** M
**Status:** Proposed

## Summary
When a user files a report (`api/posts/[id]/report/+server.ts`), enrich it with an AI triage pass: classify the reported content's likely issue (hate, harassment, spam, misinformation-claim, off-topic, none-detected) and assign a severity, stored on the report row. This turns the flat `reports` table into a prioritised queue and gives the demo a credible "moderation operations" story without building a full admin console.

## Why it fits BirdsEye
project.md §4.7 makes the report button an MVP requirement and §9.7 stresses that "a platform where anyone posts news needs a floor." Today `reports` (`schema.ts:151`) is an unordered insert-only table with no triage — fine for storage, weak for a demo narrative. AI triage adds a moderation-ops layer. It respects §4.5 precisely: the triage classifies *policy violations and report validity*, never whether the post's *claim* is true. A report alleging "this news is fake" is classified as `misinformation-claim` meaning "a user disputes the facts" — the AI explicitly does NOT adjudicate it; that stays with the crowd vote. The triage label must never feed the credibility meter.

## User value
- (For the team/judges) A believable moderation workflow: reports surface worst-first instead of newest-first.
- Frivolous or duplicate reports get a low severity so genuine harm rises to the top.
- Keeps the §4.5 boundary crisp: even a "this is misinformation" report is routed as a *dispute to be voted on*, not fact-checked by AI.

## Data model changes
Extend `reports` (`schema.ts:151`):
```ts
triageCategory: text('triage_category'),   // hate|harassment|spam|misinformation-claim|off-topic|none-detected | null
triageSeverity: integer('triage_severity'), // 0-3, null until triaged
triageNote: text('triage_note'),            // one-line AI rationale | null
triagedAt: timestamp('triaged_at', { withTimezone: true })
```
All nullable — a report is inserted immediately and triaged after, so a triage failure never blocks the report.

## API / server changes
- `src/lib/server/ai.ts` — new `triageReport({ reason, contentType, contentText })`:
  - Model: `gpt-4o-mini` (`ai.ts:7`), `max_tokens: 60`, `temperature: 0`, strict JSON output `{ category, severity, note }`.
  - Prompt: classify the *report* — is the flagged content a policy violation, and how severe. Explicit rule: "If the report alleges the post is factually false, classify as `misinformation-claim` with severity ≤1; you are NOT deciding whether the claim is true — that is the community's job. Never label content true or false."
  - Cost: ~250 tokens per report, negligible. No caching needed (one-shot per report).
  - Failure fallback: on error / no API key, leave triage columns null — the report still exists and is simply untriaged.
- `src/routes/api/posts/[id]/report/+server.ts`: after the existing `db.insert(reports)` (lines 16-28), fetch the reported post/comment text, then fire `triageReport` and update the row. Do this *after* returning success to the user (don't block the response) — either `await` post-response via a fire-and-forget call or run it inline before `json()` if latency is acceptable (~300ms). Recommend fire-and-forget with a `try/catch`, mirroring the never-throws pattern of `maybeRegenerateNote` (`ai.ts:87`).
- New read endpoint `src/routes/api/admin/reports/+server.ts` — `GET` returns reports ordered by `triageSeverity desc, createdAt desc`. For a 48h hackathon, gate it behind a simple env-configured admin email check against `locals.user.email` (no role system per §3); document this clearly.

## UI / component changes
- New lightweight page `src/routes/admin/reports/+page.svelte`: a table of reports with severity badge, triage category, AI note, link to the content, and the reporter's reason. Read-only is acceptable for the demo (no action buttons required, though a "dismiss" could be a fast follow).
- No changes to the public reporting UI (`CommentThread.svelte:146` report panel stays as-is) — triage is invisible to reporters.

## Dependencies & risks
- No new dependencies.
- Risk: AI mislabels a report. Mitigate — triage is advisory metadata only; a human still reads the queue, and severity never auto-acts on content.
- Risk: the admin page is access-controlled only by an email check — acceptable for a hackathon demo but must be flagged as not production auth.
- Risk: scope creep into a full moderation console — explicitly keep it read-only.

## Implementation steps
1. Add the four triage columns to `reports` in `schema.ts`; generate a migration.
2. Add `triageReport` to `src/lib/server/ai.ts` with strict JSON output.
3. In `report/+server.ts`, fetch reported content text and fire `triageReport` post-insert (non-blocking, never throws).
4. Create `api/admin/reports/+server.ts` with severity-ordered query and email-based gate.
5. Build the read-only `admin/reports` page.
6. Confirm a triage failure leaves a usable, untriaged report.

## Testing & verification
- Unit: `triageReport` returns high severity for clearly abusive content, `misinformation-claim` severity ≤1 for a "this is fake news" report, `none-detected` for a vague complaint.
- Manual: file reports of varying severity → admin page orders them worst-first.
- Confirm no API key → reports still insert, triage columns null, admin page renders them at the bottom.
- Confirm triage label never appears on the public post or credibility meter.

## Out of scope / future
- Moderator actions (hide/delete/ban) from the admin page.
- Auto-hiding content above a severity threshold.
- A real role/permission system (§3 keeps one role for 48h).
- De-duplicating multiple reports of the same content.
