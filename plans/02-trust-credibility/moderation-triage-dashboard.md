# Moderation / Report Triage Dashboard

**Domain:** Trust, credibility & anti-abuse
**Complexity:** XL
**Status:** Proposed

## Summary
A dedicated `/moderation` view that aggregates everything needing human
attention — reports filed against posts and comments, plus vote-brigading flags
— into a single triage queue, with the context needed to act (the reported
content, who reported it, how many times) and actions to resolve a report or
remove offending content.

## Why it fits BirdsEye
`project.md` §4.7 makes moderation an MVP requirement and §9.7 states "a
platform where anyone posts 'news' needs a floor ... a judge posting hateful
content that goes live is a demo-ending failure." The pieces exist but are
disconnected: the `reports` table (`schema.ts:151-160`) is *written* by
`report/+server.ts` but never *read* anywhere — reports currently go into a
black hole. This feature closes that loop: it gives the reports table a reader
and an action surface, and is the natural home for the vote-brigading flags
(see the vote-velocity plan). It is the operational backbone for every other
trust feature.

## Why XL
It spans a new schema column, new server queries joining four tables, a new
authenticated route with access control, multiple new components, and content-
removal actions with cascade implications — and access control itself is a
design question (`project.md` §3: "no privilege tiers").

## User value
Whoever runs the demo (or a future operator) can see and act on abuse instead of
trusting that the moderation endpoint caught everything. Reporters get the sense
their reports matter. Readers are protected from content that slipped past the
automated OpenAI moderation pass (`comments/+server.ts:27`).

## Data model changes
1. Add a moderator flag to `users` (`src/lib/server/db/schema.ts:18-30`):
   ```ts
   isModerator: boolean('is_moderator').notNull().default(false)
   ```
   This is the minimal deviation from §3's "no privilege tiers" — it grants no
   posting/voting privilege, only access to the triage view. Set via DB seed.
2. Add resolution tracking to `reports` (`schema.ts:151-160`):
   ```ts
   status: reportStatus('status').notNull().default('open'),  // open|resolved|dismissed
   resolvedBy: uuid('resolved_by').references(() => users.id),
   resolvedAt: timestamp('resolved_at', { withTimezone: true })
   ```
   with `export const reportStatus = pgEnum('report_status', ['open','resolved','dismissed']);`
3. Add a soft-removal marker to `posts` and `comments`:
   `removedAt: timestamp('removed_at', { withTimezone: true })` — soft delete so
   removal is auditable and reversible, rather than a hard `DELETE`.

## API / server changes
- New `src/lib/server/moderation.ts`:
  - `getTriageQueue()` — returns open reports grouped by target, joining
    `reports` → `posts`/`comments` for content + `users` for reporter name, with
    a per-target report count; merged with unresolved `post_vote_flags` rows
    (vote-velocity plan). Ordered by report count then recency.
  - `resolveReport(reportId, moderatorId, action)` — set `status`,
    `resolved_by`, `resolved_at`.
  - `removeContent(targetType, targetId, moderatorId)` — set `removed_at`.
- New route `src/routes/moderation/+page.server.ts` — `load` throws
  `error(403)` unless `locals.user?.isModerator`; returns `getTriageQueue()`.
  `SessionUser` in `src/lib/types.ts:7-12` and `validateSession`
  (`auth.ts:52-77`) must carry the new `isModerator` field.
- New `src/routes/moderation/+page.server.ts` actions (or `/api/moderation/*`
  endpoints) for resolve / dismiss / remove, each re-checking `isModerator`
  server-side.
- `listPosts` (`posts.ts:160`), `getPostDetail` (`posts.ts:206`) and
  `getComments` (`posts.ts:315`) — filter out rows where `removed_at` is not
  null so removed content disappears from the public site.

## UI / component changes
- New `src/routes/moderation/+page.svelte` — the triage queue: each item shows
  the offending content excerpt, target type, report count, reporter reasons,
  and Resolve / Dismiss / Remove buttons.
- New `src/lib/components/TriageCard.svelte` — one queue item.
- `src/lib/components/UserMenu.svelte` — add a "Moderation" link, shown only
  when the session user `isModerator`.
- Reuse the existing report UX already in `CommentThread.svelte:146-170` and the
  post report endpoint (`report/+server.ts`); no change to the *filing* side.

## Dependencies & risks
- No new packages.
- Risk: access control is the highest-risk part — every `load` and every action
  must re-verify `isModerator` server-side (mirror the email-verified gate
  pattern, `vote/+server.ts:18-19`). Never rely on hiding the menu link.
- Risk: §3 says "no privilege tiers"; introducing `isModerator` is a deliberate,
  documented exception scoped strictly to the triage view — call this out.
- Risk: hard-deleting reported content would cascade (`onDelete: 'cascade'`
  everywhere in `schema.ts`) and lose the audit trail — hence soft `removed_at`.
- Scope risk: this is XL. If time is short, ship read-only triage (queue +
  resolve) and defer content removal.

## Implementation steps
1. Add `isModerator` to `users`; `status`/`resolvedBy`/`resolvedAt` to
   `reports`; `removedAt` to `posts` and `comments`; add the `reportStatus`
   enum. Generate migrations.
2. Carry `isModerator` through `validateSession` (`auth.ts:52-77`) and
   `SessionUser` (`types.ts`).
3. Build `src/lib/server/moderation.ts` (`getTriageQueue`, `resolveReport`,
   `removeContent`).
4. Create the `/moderation` route with a server-side `isModerator` gate and
   resolve/dismiss/remove actions.
5. Build `+page.svelte` and `TriageCard.svelte`.
6. Add the conditional "Moderation" link to `UserMenu.svelte`.
7. Filter `removed_at IS NULL` in `listPosts`, `getPostDetail`, `getComments`.
8. Seed one moderator account in demo data.

## Testing & verification
- Visit `/moderation` as a non-moderator → 403; as a moderator → queue renders.
- File two reports on one post → they collapse into one queue item with count 2.
- Resolve a report → it leaves the queue; `status`/`resolvedBy` set.
- Remove a post → `removed_at` set; the post vanishes from the map/headline
  list and article view but the row (and its votes) survives.
- Confirm every action endpoint rejects a non-moderator even with a forged
  request.

## Out of scope / future
- An appeal flow for removed content.
- Auto-actioning at a report threshold.
- Moderator audit log / activity history (could reuse the vote-audit-log
  pattern if that feature ships).
- Granular roles beyond the single `isModerator` boolean.
