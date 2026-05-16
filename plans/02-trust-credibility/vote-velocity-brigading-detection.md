# Vote-Velocity Brigading Detection

**Domain:** Trust, credibility & anti-abuse
**Complexity:** L
**Status:** Proposed

## Summary
Detect abnormal bursts of votes on a post — a sudden spike in vote rate, or many
votes from accounts created in the last few hours — and flag the post as
"unusual voting activity". Flagged posts show a soft banner on the credibility
meter and surface in the moderation triage view.

## Why it fits BirdsEye
`project.md` §9.3 calls vote brigading the central abuse risk: "Open
truth-voting invites sock-puppets and pile-ons." The existing MVP defences
(email-verified gate `vote/+server.ts:18`, one vote per account
`schema.ts:99`, signup IP rate-limit `signup/+page.server.ts:45-58`, location
gate `vote/+server.ts:45`) all act at *write time on a single vote*. None of
them detect a *coordinated pattern*. This feature adds the missing pattern-level
defence and turns the timestamp data already on every vote
(`post_votes.created_at`, `schema.ts:96`) into a signal.

## User value
Readers get an honest warning when a post's score may be manipulated rather than
a silently skewed meter. Moderators get an early-warning queue. It protects the
integrity of the one truth signal the platform has (§1).

## Data model changes
Add a `post_vote_flags` table (Drizzle, `src/lib/server/db/schema.ts`):

```ts
export const voteFlagReason = pgEnum('vote_flag_reason', [
  'velocity_spike', 'new_account_cluster'
]);

export const postVoteFlags = pgTable('post_vote_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  reason: voteFlagReason('reason').notNull(),
  detail: text('detail').notNull(),        // e.g. "31 votes in 4 min"
  resolved: boolean('resolved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => ({ byPost: index('vote_flags_post').on(t.postId) }));
```

No change to `post_votes` itself; `created_at` (`schema.ts:96`) and
`users.created_at` (`schema.ts:25`) supply the inputs.

## API / server changes
- New module `src/lib/server/brigading.ts` with `checkVelocity(postId)`:
  - **Velocity spike:** count votes on the post in the trailing 5 minutes; if it
    exceeds a threshold (e.g. `>= 12` and `>= 3x` the post's prior 30-min
    average) insert a `velocity_spike` flag.
  - **New-account cluster:** of the last N votes, count voters whose
    `users.created_at` is within 6 hours of their vote; if that share exceeds
    ~60% insert a `new_account_cluster` flag.
  - Idempotent: skip if an unresolved flag of the same reason already exists.
- Call `checkVelocity(params.id)` at the end of `vote/+server.ts` after the
  insert (`vote/+server.ts:60`), non-blocking — wrap in a try/catch so a
  detection error never fails the vote.
- `getPostDetail` (`posts.ts:206`) — add `voteFlagged: boolean` and an optional
  `voteFlagReason` to `PostDetail` by selecting unresolved rows from
  `post_vote_flags`.

## UI / component changes
- `src/lib/components/CredibilityMeter.svelte` — when `post.voteFlagged`, render
  a muted warning row above the bar (`CredibilityMeter.svelte:147`): "Unusual
  voting activity detected — this score is under review." Use the existing
  `.error-text` / muted styling vocabulary.
- Surface flagged posts in the moderation triage view (see the report-triage
  dashboard plan) — flags and reports share that queue.

## Dependencies & risks
- No new packages — all SQL aggregate queries via Drizzle.
- Risk: false positives from a genuinely viral local story. Mitigation: require
  *both* a high absolute count and a multiple of the baseline; keep the banner
  soft ("under review"), never auto-hide the post or zero the score.
- Risk: a per-vote synchronous check adds latency. Mitigation: keep the queries
  indexed (`votes_post`, `schema.ts:100`) and run detection after the response
  is computed; consider fire-and-forget.

## Implementation steps
1. Add the `voteFlagReason` enum and `postVoteFlags` table to `schema.ts`;
   generate the Drizzle migration.
2. Create `src/lib/server/brigading.ts` with `checkVelocity()` implementing both
   heuristics and idempotent inserts.
3. Wire the call into `vote/+server.ts` after the upsert, guarded by try/catch.
4. Extend `PostDetail` (`types.ts`) + `getPostDetail` with `voteFlagged` /
   `voteFlagReason`.
5. Add the warning banner to `CredibilityMeter.svelte`.
6. Expose unresolved flags to the moderation triage view.

## Testing & verification
- Seed 15 votes within 2 minutes on one post → assert a `velocity_spike` row.
- Seed votes mostly from accounts created minutes earlier → assert a
  `new_account_cluster` row.
- Seed a slow trickle of votes → assert no flag.
- Confirm a thrown error inside `checkVelocity` still returns a 200 vote
  response.

## Out of scope / future
- IP / device fingerprint correlation across voters.
- Automatic temporary score freezing.
- A background re-scan job (MVP only checks on new votes).
