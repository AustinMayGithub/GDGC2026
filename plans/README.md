# BirdsEye — Feature & Improvement Plans

33 proposed features and improvements, researched against the live codebase and
`project.md`. Each file is a self-contained, implementation-ready plan (summary,
rationale, data model, API/UI changes, risks, step-by-step build, testing).

**Complexity:** S = small · M = medium · L = large · XL = extra-large.
Pick the ones you want and assign an implementation agent per plan file.

---

## 01 · Map, visualization & navigation

| Feature | Cx | Plan |
|---|---|---|
| Map filters (category / recency / credibility) | S | [map-filters.md](01-map-visualization/map-filters.md) |
| Trending pulse on hot markers | S | [trending-pulse-markers.md](01-map-visualization/trending-pulse-markers.md) |
| MapLibre marker clustering | M | [marker-clustering.md](01-map-visualization/marker-clustering.md) |
| "Stories near me" proximity search | M | [stories-near-me.md](01-map-visualization/stories-near-me.md) |
| National post-density choropleth by region | L | [national-density-choropleth.md](01-map-visualization/national-density-choropleth.md) |
| Story-spread time scrubber | XL | [story-spread-time-scrubber.md](01-map-visualization/story-spread-time-scrubber.md) |

## 02 · Trust, credibility & anti-abuse

| Feature | Cx | Plan |
|---|---|---|
| Comment "helpful" voting | S | [comment-helpful-voting.md](02-trust-credibility/comment-helpful-voting.md) |
| Proximity-weighted votes | M | [proximity-weighted-votes.md](02-trust-credibility/proximity-weighted-votes.md) |
| Evidence / source linking on posts | M | [evidence-source-linking.md](02-trust-credibility/evidence-source-linking.md) |
| Author reputation surfaced cross-post | M | [author-reputation-cross-post.md](02-trust-credibility/author-reputation-cross-post.md) |
| Vote-velocity brigading detection | L | [vote-velocity-brigading-detection.md](02-trust-credibility/vote-velocity-brigading-detection.md) |
| Moderation / report triage dashboard | XL | [moderation-triage-dashboard.md](02-trust-credibility/moderation-triage-dashboard.md) |

## 03 · Social, engagement & notifications

| Feature | Cx | Plan |
|---|---|---|
| Bookmark / save posts | S | [bookmark-save-posts.md](03-social-engagement/bookmark-save-posts.md) |
| First-run onboarding flow | S | [first-run-onboarding.md](03-social-engagement/first-run-onboarding.md) |
| Comment sorting & comment reactions | M | [comment-sorting-and-reactions.md](03-social-engagement/comment-sorting-and-reactions.md) |
| @mentions in comments | M | [mentions-in-comments.md](03-social-engagement/mentions-in-comments.md) |
| Follow a region + in-app notifications | L | [follow-regions-and-notifications.md](03-social-engagement/follow-regions-and-notifications.md) |
| "Developing story" post updates & timeline | L | [developing-story-timeline.md](03-social-engagement/developing-story-timeline.md) |
| OG share cards + weekly email digest | XL | [og-share-cards-and-digest.md](03-social-engagement/og-share-cards-and-digest.md) |

## 04 · AI & content intelligence

> Every AI plan respects `project.md` §4.5 — the AI never declares truth; the crowd vote is the only credibility signal.

| Feature | Cx | Plan |
|---|---|---|
| Comment toxicity pre-warning | S | [comment-toxicity-pre-warning.md](04-ai-intelligence/comment-toxicity-pre-warning.md) |
| AI category suggestion (personal vs factual) | S | [ai-category-suggestion.md](04-ai-intelligence/ai-category-suggestion.md) |
| Community note quality upgrade (cited comments, clusters) | M | [community-note-citations-upgrade.md](04-ai-intelligence/community-note-citations-upgrade.md) |
| AI-assisted report triage | M | [ai-report-triage.md](04-ai-intelligence/ai-report-triage.md) |
| Image captioning, alt-text & moderation | M | [image-captioning-alttext-moderation.md](04-ai-intelligence/image-captioning-alttext-moderation.md) |
| Semantic search & duplicate/related-post detection | L | [semantic-search-and-duplicate-detection.md](04-ai-intelligence/semantic-search-and-duplicate-detection.md) |
| AI region digest with te reo Māori / multilingual delivery | XL | [region-digest-multilingual.md](04-ai-intelligence/region-digest-multilingual.md) |

## 05 · Performance, infrastructure, accessibility & UX

| Feature | Cx | Plan |
|---|---|---|
| Lazy-load & code-split the MapLibre bundle | S | [code-split-maplibre-bundle.md](05-platform-ux/code-split-maplibre-bundle.md) |
| Full-text post search | M | [full-text-post-search.md](05-platform-ux/full-text-post-search.md) |
| Near-real-time updates via polling | M | [near-real-time-polling.md](05-platform-ux/near-real-time-polling.md) |
| Accessibility audit & fixes | M | [accessibility-audit-and-fixes.md](05-platform-ux/accessibility-audit-and-fixes.md) |
| Post edit/delete policy & UI | M | [post-edit-delete-policy.md](05-platform-ux/post-edit-delete-policy.md) |
| Object-storage image pipeline | M | [object-storage-image-pipeline.md](05-platform-ux/object-storage-image-pipeline.md) |
| Production hardening: logging, monitoring, rate-limit | XL | [production-hardening-observability.md](05-platform-ux/production-hardening-observability.md) |

---

## Cross-cutting findings (worth reading before assigning work)

- **`reports` table is write-only.** `report/+server.ts` inserts rows but nothing reads them — closing this loop is an MVP gap per §4.7. See *moderation-triage-dashboard* and *ai-report-triage*.
- **Rate-limiting covers only signup** (`signup/+page.server.ts:45-58`). The vote and comment write paths — the brigading-sensitive ones — are unthrottled. See *production-hardening-observability* and *vote-velocity-brigading-detection*.
- **Images are base64 data URLs in Postgres** (`schema.ts:27,68`), and `headerImageDataUrl` is never moderated. See *object-storage-image-pipeline* and *image-captioning-alttext-moderation*.
- **No region polygon geometry exists** — `nz-regions.ts` ships only centroids/bboxes. *national-density-choropleth* depends on adding simplified Stats NZ GeoJSON.
- **Connector lines are the recurring schedule risk** (`ConnectorLines.svelte`) — *marker-clustering* and *story-spread-time-scrubber* both touch marker projection.
- **Reusable patterns already in the codebase:** the toggle endpoint (`react/+server.ts:28-32`), the never-throws AI contract (`ai.ts`), and the `isMissingOptionalPostColumn` migration-tolerance fallback (`posts.ts:46`) — most plans build on these.
- **`isOwn` is already computed** server-side (`posts.ts:270`) but unused — *post-edit-delete-policy* is partly pre-wired.
- **Shared ranking math is duplicated** (`+page.svelte:231-242`) — several plans suggest lifting it into `lib/ranking.ts`.

## Suggested quick wins (low effort, high value)
`code-split-maplibre-bundle` (S) · `map-filters` (S) · `comment-helpful-voting` (S) ·
`trending-pulse-markers` (S) · `accessibility-audit-and-fixes` (M).
