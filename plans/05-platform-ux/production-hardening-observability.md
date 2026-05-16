# Production Hardening: Structured Logging, Error Monitoring & Rate-limit Hardening

**Domain:** Performance, infrastructure, accessibility & UX
**Complexity:** XL
**Status:** Proposed

## Summary
A cross-cutting infrastructure track that makes BirdsEye observable and
abuse-resistant in production. Today logging is ad-hoc `console.warn`/
`console.error` (`hooks.server.ts:9`, `ai.ts:43/77/132`, `posts.ts` fallbacks),
there is no error monitoring, and rate-limiting exists **only** for signup
(`signup/+page.server.ts:45-58`) — the vote, comment, reaction, report, post,
upload and login endpoints are all unthrottled. This plan introduces: (1) a
structured request logger in `hooks.server.ts`, (2) a central server error
handler with optional Sentry, and (3) a reusable rate-limiter applied across the
write endpoints.

## Why it fits BirdsEye
project.md §3 and §9.3 build the whole anti-brigading story on "cheap defences"
— but only signup is currently rate-limited, leaving the **vote and comment**
write paths (the brigading-sensitive ones) open to a scripted client even
though the email-verified gate stands. §4.7 calls an abusive demo moment
"demo-ending"; you cannot diagnose one without logs. §6's architecture diagram
shows OpenAI and Resend as external calls — when they fail you need structured,
correlatable logs, not stray `console.error`. This is the "infrastructure"
backbone of the domain.

## User value
- Indirect but real: a platform that stays up and responsive under load during
  the demo; faster diagnosis when something breaks; brigading attempts on the
  vote/comment endpoints are throttled, protecting the credibility signal that
  §1 makes central.

## Data model changes
For a DB-backed rate limiter, generalise the existing `signup_attempts` table
(`schema.ts:162`) into a generic `rate_limit_events` table:

```ts
export const rateLimitEvents = pgTable('rate_limit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  bucket: text('bucket').notNull(),      // e.g. 'vote', 'comment', 'signup'
  key: text('key').notNull(),            // ip or userId
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => ({ lookup: index('rl_lookup').on(t.bucket, t.key, t.createdAt) }));
```

Migrate the signup path onto it (or keep `signup_attempts` and add the generic
table — the former is cleaner). Alternative: an in-process in-memory limiter
(a `Map` of sliding windows) — no schema change, but state is lost on restart
and not shared across replicas. For a single-container hackathon deploy the
in-memory limiter is acceptable; the DB table is the "proper" option. Recommend
in-memory for the 48h build, DB-backed as the documented upgrade.

## API / server changes
- New `src/lib/server/logger.ts` — a tiny structured logger emitting JSON
  lines (`{ ts, level, msg, requestId, ...fields }`). No dependency needed;
  optionally `pino` if a richer logger is wanted.
- `src/hooks.server.ts` — extend the existing `handle` (currently only
  validates the session):
  - Generate a `requestId` per request, attach to `event.locals`.
  - Log method, path, status, duration, `requestId`, `userId` after `resolve`.
  - Replace the bare `console.warn` at line 9 with `logger.warn`.
  - Add a `handleError` export — SvelteKit's server error hook — to log
    unhandled errors with the `requestId` and (optionally) forward to Sentry.
- New `src/lib/server/rate-limit.ts` — `checkRateLimit(bucket, key, limit,
  windowMs)` returning allow/deny + retry-after. Sliding-window over either the
  in-memory map or `rate_limit_events`.
- Apply `checkRateLimit` in the write endpoints, keyed by `locals.user.id`
  (fallback `getClientAddress()`):
  - `src/routes/api/posts/[id]/vote/+server.ts` — e.g. 30 votes / 10 min.
  - `src/routes/api/posts/[id]/comments/+server.ts` (`POST`) — e.g. 20 / 10 min.
  - `src/routes/api/posts/[id]/react/+server.ts` — e.g. 60 / 10 min.
  - `src/routes/api/posts/[id]/report/+server.ts` — e.g. 10 / 10 min.
  - `src/routes/api/posts/+server.ts` (`POST`) — e.g. 10 posts / 10 min.
  - `src/routes/api/uploads` (if the object-storage plan lands).
  - `src/routes/auth/login/+page.server.ts` — throttle failed logins per IP.
  - Refactor `signup/+page.server.ts:45-58` to call the shared limiter.
  - On deny, `throw error(429, ...)`.
- `src/app.d.ts` — add `requestId: string` to `App.Locals`.
- `docker-compose.yml` / `.env.example` — add `SENTRY_DSN` (optional) and a
  `LOG_LEVEL` env var.

## UI / component changes
- Minimal. Confirm 429 responses surface as a friendly message: the compose
  flow already shows `json.message` (`+page.svelte:596`); ensure vote/comment/
  reaction/report components do the same rather than failing silently.
- `src/routes/+error.svelte` — confirm it renders a clean message for 429/500
  without leaking internals.

## Dependencies & risks
- No dependency required for the logger or in-memory limiter. Optional:
  `pino` (logging) and `@sentry/sveltekit` (monitoring).
- Risk: a global limiter blocking the seeded-data script or the demo itself —
  make limits generous and per-user, and exempt server-side seeding.
- Risk: in-memory limiter resets on container restart and is not multi-replica
  safe — documented; the DB table is the fix.
- Risk: logging PII — never log full request bodies, OTP codes, passwords, or
  email addresses at info level.
- Risk: scope — this touches many files; sequence it so logging lands first
  (low risk), then rate-limiting per endpoint, then optional Sentry.

## Implementation steps
1. Add `logger.ts`; replace `console.*` calls in `hooks.server.ts`, `ai.ts`,
   `posts.ts` with structured logging.
2. Add `requestId` generation + request/response logging to `handle`; add
   `requestId` to `App.Locals` in `app.d.ts`.
3. Add the `handleError` hook export for unhandled-error logging.
4. Add `rate-limit.ts` with the in-memory sliding-window limiter.
5. Apply `checkRateLimit` to vote, comment, reaction, report, post-create,
   upload and login endpoints; refactor signup onto it.
6. Confirm 429s surface as friendly messages in the relevant components and
   `+error.svelte`.
7. (Optional) wire `@sentry/sveltekit` behind `SENTRY_DSN`; add env vars to
   `.env.example` and `docker-compose.yml`.
8. (Optional / upgrade) swap the in-memory limiter for the `rate_limit_events`
   table and migrate signup.

## Testing & verification
- Hit a write endpoint in a loop; confirm a 429 after the limit and a clean
  message in the UI.
- Confirm normal demo usage (and the seed script) never trips a limit.
- Inspect server output: one structured JSON line per request with
  `requestId`, status, duration.
- Trigger a handled and an unhandled error; confirm both are logged with the
  `requestId` and no secrets appear in logs.
- `npm run check` passes; `npm run build` + `docker compose up` still boots.

## Out of scope / future
- Distributed/Redis-backed rate limiting for multi-replica deploys.
- Log shipping / aggregation (Loki, CloudWatch).
- Full APM tracing / metrics dashboards.
- CAPTCHA on signup (a heavier anti-abuse layer).
