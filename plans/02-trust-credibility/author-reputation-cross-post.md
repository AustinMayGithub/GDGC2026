# Author Reputation Surfaced Cross-Post

**Domain:** Trust, credibility & anti-abuse
**Complexity:** M
**Status:** Proposed

## Summary
Compute a per-author reputation from the verify/dispute outcomes of all their
factual posts and surface it everywhere the author appears — on the headline
list, on the article byline, and in vote-weighting context — not only on their
profile page where it already lives.

## Why it fits BirdsEye
`project.md` §3 says publishers are "just a user with a recognisable name" and
notes a verified badge is out of scope — but a *track record* is a fairer,
crowd-derived substitute that fits the §1 thesis that "the crowd owns the
verdict." A reputation derived purely from past vote outcomes is exactly that.
The computation already exists: `getUserProfile` in `src/lib/server/users.ts`
builds a `reputation` object with `score` and a label
(`users.ts:183-205`) — today it is only shown on the profile. This feature
promotes that existing signal so a reader sees an author's history *at the
moment they read a new claim*.

## User value
A reader can weigh a brand-new post by the author's history — a poster whose
past claims were widely verified earns trust; one whose claims were repeatedly
disputed is visibly so. It rewards accurate posting and is a soft, organic
anti-sock-puppet signal: a fresh sock-puppet account has no reputation.

## Data model changes
None required for MVP — reputation is derived on read from existing
`post_votes` rows (`schema.ts:83-102`). The `getUserProfile` logic
(`users.ts:183-195`) is the reference computation: `score = verify / (verify +
dispute)` over the author's posts, with a label, gated behind `totalVotes >= 5`.
Optional future: a cached `users.reputation_score` column refreshed periodically
(see Out of scope).

## API / server changes
- New module `src/lib/server/reputation.ts` exporting
  `getAuthorReputations(authorIds: string[])` — a single batched query that
  groups `post_votes` joined to `posts` by `posts.author_id` and returns a
  `Map<authorId, { score, label, totalVotes }>`. This generalises the
  per-user aggregation currently inlined in `users.ts:135-195` so it can run for
  a whole headline list in one query (avoid N+1).
- `listPosts` in `src/lib/server/posts.ts:160-204` — call
  `getAuthorReputations` for the distinct author ids and attach
  `authorReputation` to each `PostSummary`. Skip anonymous posts (the app
  already blanks `authorId`/`authorName` for them, `posts.ts:201-202`).
- `getPostDetail` (`posts.ts:206`) — attach the single author's reputation.
- Extend `PostSummary` in `src/lib/types.ts:15-32` with
  `authorReputation: { score: number | null; label: string } | null`.
- Refactor `getUserProfile` to consume `getAuthorReputations` so the profile
  and cross-post numbers can never diverge.

## UI / component changes
- New `src/lib/components/ReputationBadge.svelte` — a compact pill showing the
  label and score (e.g. "Trusted · 82%"), colour-keyed with the existing
  `--verify` / `--dispute` tokens used in `CredibilityMeter.svelte:271-276`.
  Renders nothing when `score` is `null` (unrated).
- `src/lib/components/HeadlineList.svelte` — show the badge next to the author
  name on each headline row.
- Article-view byline — show the badge next to the author name (the byline is
  in the article left column described in §4.2).
- Anonymous posts show no badge.

## Dependencies & risks
- No new packages.
- Risk: a new honest author has no reputation and looks the same as a
  suppressed one — the "Unrated" label (`users.ts:188`) must read as neutral,
  not negative.
- Risk: a small number of votes produces a noisy score. Mitigation: keep the
  existing `totalVotes >= 5` gate (`users.ts:189`) before any score is shown.
- Risk: reputation could discourage posting unpopular-but-true claims.
  Acceptable for a hackathon; note it in the pitch as a known tension.

## Implementation steps
1. Create `src/lib/server/reputation.ts` with the batched
   `getAuthorReputations`.
2. Refactor `getUserProfile` (`users.ts`) to call it — single source of truth.
3. Extend `PostSummary` (and `PostDetail` via inheritance) in `types.ts`.
4. Attach `authorReputation` in `listPosts` and `getPostDetail`.
5. Build `ReputationBadge.svelte`.
6. Render the badge in `HeadlineList.svelte` and the article byline; suppress
   for anonymous posts.

## Testing & verification
- Seed an author with mostly-verified factual posts → badge shows a high score
  on the headline list and matches their profile page exactly.
- Seed an author with `< 5` total votes → badge hidden / "Unrated".
- Confirm anonymous posts never render a badge or leak the author id.
- Confirm the headline list issues one reputation query, not one per post.

## Out of scope / future
- A cached `users.reputation_score` column with a refresh job.
- Time-decay so old outcomes weigh less.
- A separate "verified publisher" badge (explicitly out of scope per §3).
