# BirdsEye - Project Design v1

A location-based social platform for community news. Part Facebook grapevine,
part bulletin board, part news site - posts surface on a map of New Zealand,
and the crowd plus an AI "community note" help readers gauge what's credible.

Built for the **GDGC NZ 2026 hackathon**.

**Constraints (decided):** 48-hour build · team of 4+ · all content is
user-generated · OpenAI API for AI features.

---

## 1. Vision

The core idea is strong: **news has a location and a blast radius**, and
BirdsEye makes both visible. Instead of an endless vertical feed, you see *where*
things are happening and *how far they reach*. The signature interaction is the
map-of-NZ home page with lines drawn from geographic points out to a list of
headlines - a "control room" view of the country.

Two truth signals sit side by side on every factual post:

- **The crowd** - a verify/dispute vote bar (the credibility meter).
- **The AI** - a neutral summary of the comment discussion (the community note).

Keeping these *separate* is important (see §9): the crowd owns the verdict, the
AI only summarises the conversation. The AI never declares something true or false.

---

## 2. Core Concepts & Glossary

| Term | Meaning |
|------|---------|
| **Post** | A user-created news item or community notice. Has a location and an impact radius. |
| **Personal post** | A community notice / opinion / event. No truth claim → **no voting, no community note.** |
| **Factual post** | A claim about something that happened. Gets the full treatment: voting + community note. |
| **Impact zone** | A circle (centre + radius) the poster sets - the area the news affects. |
| **Credibility meter** | The % verify / % dispute bar derived from votes on a factual post. |
| **Community note** | AI-generated summary of the comment thread for a factual post. |
| **National mode** | Home page showing all of NZ. |
| **Local mode** | Home page zoomed to the user's region. |

Naming: prefer **Verify** / **Dispute** over "positive/negative" in the UI - it
states what the vote *means* (this is a credibility judgement, not a like button).

---

## 3. User Roles & Auth

Per the brief, **users, publishers and companies are one role** - no privilege
tiers. A "publisher" is just a user with a recognisable name. (A future
verified-badge could distinguish them, but it's out of scope for 48h.)

**Auth flow:**

1. Sign up with email + password.
2. Email **OTP verification** at signup - required to activate the account.
3. Login = password. Optional second-factor OTP at login (toggleable per account).

A note on terminology: emailing a one-time code is technically *email OTP*, not
true 2FA (a second independent factor). For a hackathon that distinction won't
matter to judges - call it "2FA email verification" in the pitch, but build the
simplest thing: **OTP at signup (MVP)**, **OTP at login as a toggle (nice-to-have)**.

Email delivery: **Resend** (generous free tier, one-line API, no SMTP setup).

**Anti-sock-puppet measures (MVP).** Email verification is not just a nicety -
it is the gate that makes voting meaningful. Voting is restricted to
email-verified accounts, enforced **server-side**. At signup, also rate-limit
account creation per IP (e.g. max 3 per 10 minutes) and reject known
disposable-email domains from a static blocklist. Together these kill the
cheapest brigading paths for roughly half an hour of work. See §9.3.

Sessions: signed HTTP-only cookie + a `sessions` table. Hand-rolled is fine at
this scale; don't reach for a heavy auth library.

---

## 4. Feature Spec

### 4.1 Home / Map view

- Greyscale, minimalist outline of NZ. Rendered from **local GeoJSON**, not map
  tiles (see §8) - this nails the aesthetic and removes an external dependency.
- Posts appear as small markers at their location.
- **Connector lines** run from each marker to its headline in a side list.
- **National ⇄ Local toggle.** National = whole country. Local = zoom to the
  user's region (browser geolocation → point-in-polygon against region GeoJSON;
  fallback = manual region picker).
- Clicking a headline or marker opens the **Article view**.

To avoid line spaghetti: cap the side list at ~8–12 items (most recent /
trending), draw connectors faintly, and highlight the connector + marker on hover.

### 4.2 Article view

Split layout:

- **Left:** the post - title, body, author, timestamp, category badge.
- **Right (collapsible tab):**
  1. **Impact map** - zoomed in, with the impact-zone circle.
  2. **Credibility meter** - % verify / % dispute bar; the reader can vote here.
  3. **Community note** - AI summary of the comments.
  4. **Comments** - the thread, below the note.

The right tab can be minimised to read the article full-width.

> **Design change - the "voting radii".** The brief asks for two extra radii on
> this map showing "where people vote positive / negative". A radius is a single
> circle around one point - it can't express *where a group of people* are. To
> show vote geography you need voter locations, which is a **heatmap or clustered
> dots**, not a radius. Recommended: keep the single impact-zone circle, and if
> you want vote geography, overlay a green/red **vote heatmap**. Treat the
> heatmap as nice-to-have; the % bar already carries the signal. See §9.

### 4.3 Posting system

- "New post" button opens a right-side panel (mirrors the article tab).
- Fields: title, body, **category (personal / factual)**.
- A clean map lets the user **drop a pin** for the location and **drag a radius**
  for the impact zone.
- Personal posts skip the credibility/community-note machinery entirely.

### 4.4 Reactions, comments, voting

- **Reactions:** lightweight emoji reactions on any post.
- **Comments:** flat thread (one level of replies max - keep it simple).
- **Votes:** Verify / Dispute, **factual posts only** (see §4.6), one vote per
  account, changeable. The credibility meter is `verify / (verify + dispute)`.
- Voting is gated to **email-verified accounts, enforced server-side** on the
  vote endpoint - not a hidden button. This is the main cheap defence against
  sock-puppet brigading; see §3 and §9.3.

### 4.5 AI Community Notes (OpenAI)

- The note has **one job: summarise the opinions expressed in the comments** -
  what readers are saying and the range of views. Nothing more.
- Input: the post's comment thread. Output: one short, neutral paragraph.
- **The note does not pronounce truth and does not fact-check the post.** It
  reports the discussion, not a verdict. The crowd credibility meter is the only
  truth signal. A UI label says so: "AI summary of the discussion - not a fact
  check."
- **No comments → no note.** Skip the API call when the thread is empty; show a
  static "No discussion yet" placeholder instead.
- **Regeneration runs after each posted comment.** Store the note in the DB with
  the comment-count it was based on, and never block a page load on the API call.

### 4.6 Personal vs factual posts - divergent behaviour

The two categories drive different code paths, not just a label. Make this
explicit, or users will try to "verify" a garage-sale notice.

| Capability | Personal post | Factual post |
|------------|---------------|--------------|
| Verify / Dispute voting | ✗ | ✓ |
| Credibility meter | ✗ | ✓ |
| AI community note | ✗ | ✓ |
| Comments & reactions | ✓ | ✓ |
| Appears on the map | ✓ | ✓ |

- The category is chosen at posting time. Personal posts skip the entire
  credibility/note pipeline - cheaper, and correct, since they make no truth
  claim.
- When a user picks "factual", show a one-line notice: "Factual posts are
  subject to community verification." The friction deters casual
  miscategorisation.

### 4.7 Moderation (MVP)

- Every new post and comment passes through OpenAI's moderation endpoint before
  it is stored. It is free, fast, and a hard requirement - a judge or bystander
  posting hateful content that goes live is a demo-ending failure.
- A **report button** on posts and comments writes to the `reports` table.

---

## 5. Tech Stack & Rationale

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **SvelteKit** | Per brief. SSR for data, form actions for posting/voting. |
| Map | **MapLibre GL JS** | Free, no token, GPU-rendered, smooth zoom, easy custom greyscale styling. Renders our NZ GeoJSON directly. |
| Database | **PostgreSQL + PostGIS** | Per brief. PostGIS makes "posts in this region" / "votes near impact zone" trivial - `postgis/postgis` Docker image is a drop-in. |
| ORM | **Drizzle** | Type-safe, lightweight, great SvelteKit fit, fast to set up. |
| Auth | Hand-rolled sessions + cookies | Simple at this scale; no heavy library. |
| Email | **Resend** | One-line API for OTP delivery. |
| AI | **OpenAI API** | Per brief. Chat completions for notes, moderation endpoint for safety. |
| Deploy | **Docker Compose** | Per brief. Services: `web` (SvelteKit/Node adapter), `db` (PostGIS). |

**Map library call:** MapLibre GL JS. Leaflet is the simpler fallback if the
team hits trouble, but MapLibre's vector rendering gives smoother national→local
zoom and cleaner custom theming. Mapbox GL is rejected - it needs a paid token.

---

## 6. Architecture

```
┌─────────────┐     ┌────────────────────────┐     ┌──────────────┐
│  Browser    │────▶│  SvelteKit (Node)      │────▶│ PostgreSQL   │
│  MapLibre   │     │  - pages / load fns    │     │ + PostGIS    │
│  geolocation│◀────│  - form actions (API)  │◀────│              │
└─────────────┘     │  - AI note service     │     └──────────────┘
                    └──────────┬─────────────┘
                               │
                    ┌──────────▼──────────┐   ┌──────────────┐
                    │  OpenAI API         │   │  Resend      │
                    │  (notes + moderate) │   │  (OTP email) │
                    └─────────────────────┘   └──────────────┘
```

- The community-note generation is the one slow/expensive call. Run it
  **server-side, debounced, cached in the DB** - never block a request on it.
  A simple in-process queue or a "needs_refresh" flag checked on read is enough
  for 48h; no separate worker service needed.
- All of NZ's geometry ships as static GeoJSON in the app - no GIS server.

---

## 7. Data Model

```
users          (id, email, password_hash, display_name, created_at,
                email_verified, login_otp_enabled)
sessions       (id, user_id, expires_at)
email_otps     (id, user_id, code_hash, purpose[signup|login], expires_at, used)

posts          (id, author_id, title, body, category[personal|factual],
                lng, lat, impact_radius_m, created_at)
                -- + PostGIS geography column for location

post_votes     (id, post_id, user_id, vote[verify|dispute],
                voter_lng, voter_lat, created_at)
                -- one row per (post,user); voter location optional, for heatmap

comments       (id, post_id, author_id, parent_id, body, created_at)
reactions      (id, post_id, user_id, emoji)

community_notes(id, post_id, body, based_on_comment_count, generated_at)

reports        (id, post_id|comment_id, reporter_id, reason, created_at)
```

Notes:
- `voter_lng/lat` on votes exists *only* to power the optional vote heatmap. If
  you cut the heatmap, drop these columns.
- Storing location as a PostGIS `geography` column lets region filtering and
  proximity queries be one-liners.

---

## 8. The Map - Technical Deep Dive

This is the visual centrepiece and the riskiest UI. Plan it deliberately.

**Rendering NZ.** Don't use map tiles for the home page. Ship a simplified
GeoJSON/TopoJSON of NZ - country outline for national mode, the 16 regional
council boundaries for local mode (source: Stats NZ open data, simplified with
`mapshaper`). MapLibre renders these as styled layers: light-grey fill, darker
outline. Result: exact minimalist aesthetic, instant theming, zero tile
provider, zero API key, tiny payload.

**The connector lines.** This is custom - no map library does it natively, and
it is the project's biggest schedule risk. Build a working spike on fake data
**inside the first 4–6 hours** so the team can commit to the fallback early if
it is shaky (see §9.4).

- An absolutely-positioned **SVG overlay** spans the *full page*, not just the
  map+list section. Set `pointer-events: none` on it, or it silently blocks map
  pan/zoom on touch devices.
- For each visible post: get its screen pixel via `map.project([lng,lat])`, get
  the headline element's `getBoundingClientRect()`, and **translate both into the
  same coordinate space** (document-relative) before drawing. `map.project()`
  returns canvas-space pixels and `getBoundingClientRect()` returns viewport
  pixels - they diverge whenever the map is not flush with the viewport edge, and
  mismatching them is a silent, hard-to-debug bug.
- Draw a quadratic-bezier path between the two points.
- Recompute on map `move`/`zoom`, on list `scroll`, and on window `resize`.
  Throttle with `requestAnimationFrame`.
- **Clutter control:** cap at ~8–12 connectors, render them faint, highlight one
  on hover. This is also why the side list is "top/trending", not "everything".

**Local mode.** Browser geolocation → lat/lng → point-in-polygon against the
region GeoJSON → that region. Zoom the map to the region's bounding box. Always
provide a manual region dropdown as fallback (geolocation gets denied a lot).

**Marker clustering.** Multiple posts in one city will overlap. MapLibre's
built-in GeoJSON source clustering handles this - enable it from the start.

**Article-view impact map.** A small map zoomed to the post, with the impact
circle drawn as a GeoJSON circle polygon. A light basemap *may* help here for
street context - acceptable to add one minimal vector style on this screen only.

---

## 9. Issues, Risks & Recommended Changes

Ranked by how much they should change the plan.

1. **The "two voting radii" don't carry meaning.** *(design fix - §4.2)*
   A radius is one circle around one point; it can't show where a population of
   voters sits. Replace with a green/red **vote heatmap** if you want vote
   geography, or just rely on the % bar. **Cut the radii concept.** Heatmap is
   nice-to-have, not MVP.

2. **The AI only summarises comment opinions - resolved.** *(see §4.5)*
   "AI gauges credibility" is a trap: the model can't verify facts and will
   confidently hallucinate. The AI's job is strictly to summarise the opinions in
   the comment thread - no verdict, no fact-check, no "discussion signals". The
   crowd vote is the only credibility signal. Clean roles, no awkward demo moment.

3. **Vote brigading - defences applied.** Open truth-voting invites sock-puppets
   and pile-ons. Mitigations now in the MVP: one vote per account, voting gated
   to email-verified accounts **enforced server-side** (§4.4), signup
   rate-limiting per IP, and a disposable-email-domain blocklist at signup (§3).
   *Strong optional feature that fits the theme:* **proximity-weighted votes** -
   a voter near the impact zone counts for more than someone across the country.
   PostGIS makes this a single distance query, and it's a genuinely novel pitch
   point. Stretch goal.

4. **Connector-line UI is the schedule risk.** *(see §8)* It's the signature
   feature and the most likely thing to eat a day. **Get a working spike on fake
   data inside the first 4–6 hours.** If it isn't solid by hour ~6, fall back to
   highlight-on-hover-only (draw a line for the hovered headline alone) - still
   looks great, far less fragile. Deciding the fallback early beats a broken
   all-lines version at demo time.

5. **Personal vs factual behave differently - resolved.** *(see §4.6)*
   Personal posts have no vote bar, no credibility meter, and no community note;
   factual posts get the full pipeline. The category is fixed at posting time,
   and the posting UI warns users when they pick "factual".

6. **Geolocation will be denied/unavailable often.** Always ship the manual
   region picker as a first-class fallback, not an afterthought.

7. **Moderation / abuse - now MVP.** A platform where anyone posts "news" needs a
   floor. Posts and comments run through OpenAI's free moderation endpoint before
   storage, plus a report button (§4.7). A judge posting hateful content that
   goes live is a demo-ending failure - this is not optional.

8. **Privacy of precise location.** A personal post pinned to an exact home
   address can dox someone. Consider snapping personal-post locations to a
   coarser grid, or nudging users to pick a nearby landmark. At minimum, note it.

9. **National feed needs a ranking rule.** "Show all posts" doesn't scale even in
   a demo. Define a simple feed: recent + engagement, capped to the list size.

10. **Real-time updates** (live comments/votes) - tempting, but skip WebSockets.
    Optimistic UI on the voter's own action + a refresh/poll is enough for 48h.

**Ideas worth adding if time allows:**

- **Trending / "what's loud right now"** - a pulse on markers with high recent
  activity. Cheap, makes the map feel alive in the demo.
- **Time scrubber** - replay how a story spread across the map. Great demo
  moment; pure frontend if data has timestamps. Stretch.
- **Follow a region** - get posts from places you care about. Post-hackathon.

---

## 10. Scope Tiers

**MVP - must work in the demo:**
- Signup/login + email OTP verification at signup.
- National map of NZ from GeoJSON, post markers, connector lines to headline list.
- Article view: article left; right tab with impact map, credibility meter, note,
  comments.
- Posting flow: title, body, category, pin location, drag radius.
- Personal vs factual posts behaving differently (§4.6).
- Verify/Dispute voting on factual posts; credibility meter.
- Anti-brigading: server-side email-verified vote gate, signup rate-limit,
  disposable-email blocklist.
- Comments.
- AI community note (comment-opinion summary) on factual posts; debounced, cached.
- Moderation: posts + comments through the moderation endpoint; report button.
- Seeded demo data - a first-class deliverable: 15–20 realistic NZ posts across
  regions, varied credibility meters, ≥1 full comment thread.

**Nice-to-have:**
- Local mode with geolocation + region fallback.
- OTP at login (the "2FA toggle").
- Marker clustering.
- Reactions.
- Docker Compose deployment.

**Stretch:**
- Vote heatmap on the article map.
- Proximity-weighted votes (PostGIS).
- Trending pulse / time scrubber.
- User profiles.

> If something has to be faked for the demo, fake **deployment** before you fake
> features - judges interact with features, not your Dockerfile.

---

## 11. 48-Hour Plan & Team Split (4+ people)

**Roles**
- **A - Frontend / Map:** home page, NZ GeoJSON rendering, connector-line
  overlay, national/local toggle.
- **B - Frontend / Product:** article view, posting panel, comments UI, the
  design system (minimalist white + gradient).
- **C - Backend:** schema + migrations, auth + OTP, anti-brigading gates
  (server-side vote gate, signup rate-limit, disposable-email blocklist),
  posts/votes/comments endpoints, region/geo queries.
- **D - AI + Infra:** OpenAI note service, moderation on the write path (MVP),
  Resend wiring, Docker Compose, deployment. Seeded demo data is a separate
  first-class task at hour 38 with its own named owner - not bundled here.

**Timeline**
- **0–6h** - Repo, SvelteKit + Drizzle + PostGIS up, schema agreed, design
  tokens, NZ GeoJSON sourced & simplified. A spikes the connector lines on fake
  data - this must be working by hour 6 (see decision gate below).
- **6–16h** - Parallel build: A map + lines · B article/posting shells ·
  C auth + posts/votes APIs + anti-brigading gates · D OpenAI note service +
  moderation + Docker skeleton.
- **16–28h** - Integration: real data through the map, posting writes to DB,
  voting updates the meter, comments thread live, moderation on the write path.
- **28–38h** - AI notes wired in and debounced, local mode, polish pass.
- **38–44h** - **Seeded demo data as a first-class task** (2–3 dedicated hours,
  one named owner): 15–20 realistic NZ posts across regions, varied credibility
  meters, ≥1 full comment thread with a generated note. Then deploy.
- **44–48h** - End-to-end rehearsal, bug bash, buffer, pitch/demo script.

**Decision gate at hour 6:** if the connector lines aren't solid, drop to
hover-only lines (§9.4) and move on. Deciding early beats a broken demo.

---

## 12. Open Questions

- **NZ GeoJSON detail level** - country outline only, or regional boundaries
  too? (Local mode needs regions. Confirm during the 0–4h block.)
- **Login OTP** - every login, or only from new devices? (Every login is
  annoying; "new device" needs device tracking. Suggest: a per-account toggle,
  default off.)
- **Reply depth** - flat comments, or one level of replies? (Recommend one
  level max.)
- **Demo geography** - which region do we showcase in local mode? Pick one and
  seed it densely (likely Auckland or Wellington).
- **Post editing / deletion** - allowed? (Suggest: delete yes, edit no for 48h -
  editing a voted-on factual post undermines the votes.)
