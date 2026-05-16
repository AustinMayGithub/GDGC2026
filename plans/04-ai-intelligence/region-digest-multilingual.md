# AI Region Digest with te reo Māori / Multilingual Delivery

**Domain:** AI & content intelligence
**Complexity:** XL
**Status:** Proposed

## Summary
A per-region "What's happening in Wellington" digest: an AI-generated rolling summary of recent posts in a region, regenerated on a schedule, cached in the DB, and shown in local mode. Each digest is generated in English and translated into te reo Māori (and optionally other languages) so the same community news is accessible bilingually. The digest reports *what was posted*, attributing claims to posts and the crowd — it never declares any of it true.

## Why it fits BirdsEye
project.md §1 frames BirdsEye as a "control room view of the country" and §9 explicitly lists "AI region digest" adjacent to the trending ideas; §4.1/§8 already model NZ as 16 regions (`nz-regions.ts`) with a national⇄local toggle. A region digest is the natural local-mode companion to the national map. te reo Māori is an official language of Aotearoa New Zealand — bilingual delivery is both culturally appropriate for a GDGC NZ hackathon and a strong, distinctive pitch point.

It respects §4.5 carefully: the digest summarises *the set of posts and their crowd signals*, not the truth of any post. Every claim is framed as attribution — "a resident reported…", "a factual post (62% verified by the community)…" — and the digest carries the same disclaimer style as the community note (`CommunityNote.svelte:27`): "AI summary of recent posts — not a fact check." Crucially, when the digest mentions a factual post it cites that post's *crowd* verify/dispute meter as the credibility signal; the AI adds none of its own. Translation only restates the same neutral text in another language — it introduces no new claim.

## User value
- A 10-second read of a region's news instead of scanning markers — makes local mode genuinely useful, not just a zoom level.
- te reo Māori readers get the same digest in their language; a clear demo differentiator and a respectful nod to Aotearoa's official languages.
- Reinforces §4.5: the digest models the right behaviour — it reports posts and points to crowd verdicts, it never adjudicates.

## Data model changes
New table:
```ts
export const regionDigests = pgTable('region_digests', {
  id: uuid('id').primaryKey().defaultRandom(),
  regionId: text('region_id').notNull(),
  lang: text('lang').notNull(),           // 'en' | 'mi' | ...
  body: text('body').notNull(),
  basedOnPostCount: integer('based_on_post_count').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  uniqueRegionLang: unique('uniq_region_lang').on(t.regionId, t.lang),
  byRegion: index('region_digest_region').on(t.regionId)
}));
```
One row per (region, language); upsert on regeneration — mirrors the `communityNotes` one-row-per-key + `onConflictDoUpdate` pattern (`ai.ts:111-117`). `regionId` reuses the existing region ids from `nz-regions.ts:14`.

Optional: a `users.preferredLang` column (`schema.ts:18`) so a logged-in user's digest defaults to their language; otherwise default by browser `Accept-Language`.

## API / server changes
- `src/lib/server/ai.ts` — two new functions:
  - `generateRegionDigest(regionId)`: select recent posts for the region (reuse `listPosts({ regionId })`, `posts.ts:160`, which already returns titles, category, and `verifyCount`/`disputeCount`). Build a prompt listing each post with its category and, for factual posts, its crowd meter percentage. System prompt rules (extend the §4.5 discipline of `SYSTEM_PROMPT`, `ai.ts:12`): "Summarise what was posted in this region. Attribute every claim to a post or to the community vote. For factual posts, state the community's verify percentage as the credibility signal. Do NOT state whether anything is true or false. Do NOT add information not in the posts." Model `gpt-4o-mini` (`ai.ts:7`), `max_tokens: ~400`, `temperature: 0.3`.
  - `translateText(text, targetLang)`: a `gpt-4o-mini` call instructed to translate faithfully into the target language (te reo Māori for `mi`) without adding, removing, or softening any claim — translation must not alter meaning. For te reo specifically, instruct it to keep place names and proper nouns intact.
  - Failure fallback: digest generation error / no API key → no digest row written, UI shows a static "Digest unavailable" placeholder (parity with the no-comments→no-note rule, §4.5 / `ai.ts:101`). Translation failure → fall back to serving the English digest with a "translation unavailable" note.
- Scheduling: the digest is expensive, so never generate on page load. Per §6 ("a simple in-process queue or a needs_refresh flag checked on read is enough for 48h; no separate worker service"):
  - Implement a `needs_refresh` strategy: on a local-mode load, if the cached digest for that region is older than N minutes (e.g. 15) AND the region has new posts since `generatedAt`, enqueue a regeneration in-process and serve the stale digest immediately. Never block the page.
  - English is generated first; translations are generated from the finished English digest in the same background job.
- New endpoint `src/routes/api/regions/[id]/digest/+server.ts` — `GET ?lang=` returns the cached digest for that region+language (or English fallback), plus `generatedAt` and `basedOnPostCount`.
- `src/lib/server/posts.ts`: add `getRegionDigest(regionId, lang)` and the staleness/refresh-trigger helper.

## UI / component changes
- New `src/lib/components/RegionDigest.svelte`: a card styled like `CommunityNote.svelte` — header, body paragraph(s), a "based on N recent posts" meta line, and the mandatory "AI summary of recent posts — not a fact check" disclaimer (copy aligned with `CommunityNote.svelte:27`).
- Language switcher: a small `en | te reo Māori` toggle in the card; on change, refetch `?lang=`.
- Home page local mode (`src/routes/+page.svelte` / `HomeMap.svelte`): when scope is `local` and a region is selected, render `RegionDigest` above or beside `HeadlineList.svelte`.
- `src/lib/types.ts`: add a `RegionDigest` interface (`{ regionId, lang, body, basedOnPostCount, generatedAt }`).

## Dependencies & risks
- No new npm dependencies (OpenAI SDK already present).
- Risk: digest cost/latency — mitigated by DB caching, staleness gating, and background regeneration; never on the request path.
- Risk: in-process queue lost on server restart — acceptable for 48h; the `needs_refresh` check rebuilds it on next load.
- Risk (cultural — important): machine-translated te reo Māori can be inaccurate or culturally tone-deaf. Mitigate — label it clearly as a machine translation, keep digest text plain and factual to translate cleanly, and (if a te reo speaker is on the team) have them spot-check the seeded demo digest. Be honest in the pitch that it is AI-assisted translation.
- Risk: a digest could drift into implying a verdict. Mitigate via the strict attribution prompt and the not-a-fact-check disclaimer; QA every demo digest against §4.5.
- Scope: this is the XL item — if time-boxed, ship English digest first, add te reo translation as the final layer; the schema and endpoint already support adding languages without rework.

## Implementation steps
1. Add the `region_digests` table (and optional `users.preferredLang`) to `schema.ts`; generate a migration.
2. Add `generateRegionDigest` and `translateText` to `src/lib/server/ai.ts` with strict §4.5-aligned prompts.
3. Implement the staleness check + in-process regeneration queue (English then translations) in `posts.ts`.
4. Create `api/regions/[id]/digest/+server.ts`.
5. Build `RegionDigest.svelte` with the language toggle and the not-a-fact-check disclaimer.
6. Wire the digest into local mode on the home page.
7. Pre-generate digests for the demo region(s) as part of the §11 hour-38 seed task; te reo spot-check.

## Testing & verification
- Unit: `generateRegionDigest` attributes claims to posts and cites crowd meters; never outputs verdict language ("confirmed", "fake", "true"). Add an assertion scanning output for forbidden verdict words.
- Unit: `translateText` round-trips meaning; output contains no added claims.
- Manual: open local mode for a seeded region → digest appears; toggle to te reo → translated text loads; an empty region shows the placeholder.
- Confirm regeneration runs in the background and never blocks the local-mode page load.
- Confirm no API key → graceful "Digest unavailable" placeholder.

## Out of scope / future
- Translating posts and comments themselves (large surface; digest-only for now).
- Real-time digest updates (poll/stale-refresh is enough per §9.10).
- Additional languages beyond en/mi (schema already supports them — add later).
- A national-level digest (natural follow-up once region digests are solid).
- Professional human review of te reo translations (note it for production).
