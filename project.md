# BirdsEye — Project Design

A location-based social platform for community news. Part Facebook grapevine,
part bulletin board, part news site — posts surface on a map of New Zealand,
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
headlines — a "control room" view of the country.

Two truth signals sit side by side on every factual post:

- **The crowd** — a verify/dispute vote bar (the credibility meter).
- **The AI** — a neutral summary of the comment discussion (the community note).

Keeping these *separate* is important (see §9): the crowd owns the verdict, the
AI only summarises the conversation. The AI never declares something true or false.

---

## 2. Core Concepts & Glossary

| Term | Meaning |
|------|---------|
| **Post** | A user-created news item or community notice. Has a location and an impact radius. |
| **Personal post** | A community notice / opinion / event. No truth claim → **no voting, no community note.** |
| **Factual post** | A claim about something that happened. Gets the full treatment: voting + community note. |
| **Impact zone** | A circle (centre + radius) the poster sets — the area the news affects. |
| **Credibility meter** | The % verify / % dispute bar derived from votes on a factual post. |
| **Community note** | AI-generated summary of the comment thread for a factual post. |
| **National mode** | Home page showing all of NZ. |
| **Local mode** | Home page zoomed to the user's region. |

Naming: prefer **Verify** / **Dispute** over "positive/negative" in the UI — it
states what the vote *means* (this is a credibility judgement, not a like button).

---

## 3. User Roles & Auth

Per the brief, **users, publishers and companies are one role** — no privilege
tiers. A "publisher" is just a user with a recognisable name. (A future
verified-badge could distinguish them, but it's out of scope for 48h.)

**Auth flow:**

1. Sign up with email + password.
2. Email **OTP verification** at signup — required to activate the account.
3. Login = password. Optional second-factor OTP at login (toggleable per account).

A note on terminology: emailing a one-time code is technically *email OTP*, not
true 2FA (a second independent factor). For a hackathon that distinction won't
matter to judges — call it "2FA email verification" in the pitch, but build the
simplest thing: **OTP at signup (MVP)**, **OTP at login as a toggle (nice-to-have)**.

Email delivery: **Resend** (generous free tier, one-line API, no SMTP setup).

Sessions: signed HTTP-only cookie + a `sessions` table. Hand-rolled is fine at
this scale; don't reach for a heavy auth library.

---

## 4. Feature Spec

### 4.1 Home / Map view

- Greyscale, minimalist outline of NZ. Rendered from **local GeoJSON**, not map
  tiles (see §8) — this nails the aesthetic and removes an external dependency.
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

- **Left:** the post — title, body, author, timestamp, category badge.
- **Right (collapsible tab):**
  1. **Impact map** — zoomed in, with the impact-zone circle.
  2. **Credibility meter** — % verify / % dispute bar; the reader can vote here.
  3. **Community note** — AI summary of the comments.
  4. **Comments** — the thread, below the note.

The right tab can be minimised to read the article full-width.

> **Design change — the "voting radii".** The brief asks for two extra radii on
> this map showing "where people vote positive / negative". A radius is a single
> circle around one point — it can't express *where a group of people* are. To
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
- **Comments:** flat thread (one level of replies max — keep it simple).
- **Votes:** Verify / Dispute, **factual posts only**, one vote per account,
  changeable. The credibility meter is `verify / (verify + dispute)`.

### 4.5 AI Community Notes (OpenAI)

- Input: the post + its comments. Output: a short neutral paragraph summarising
  what the discussion says, what evidence is offered, and which points are
  contested.
- **The note does not pronounce truth.** It may flag *discussion-level* signals
  ("no sources cited", "commenters dispute the date") but the verdict belongs to
  the vote bar.
- **Regeneration is debounced** — not on every comment. Regenerate when ≥5 new
  comments arrive *or* 10 minutes pass since the last note. Store the note in the
  DB with the comment-count it was based on.
- **Moderation:** run new comments and posts through OpenAI's (free) moderation
  endpoint before they're stored.

---

## 5. Tech Stack & Rationale

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **SvelteKit** | Per brief. SSR for data, form actions for posting/voting. |
| Map | **MapLibre GL JS** | Free, no token, GPU-rendered, smooth zoom, easy custom greyscale styling. Renders our NZ GeoJSON directly. |
| Database | **PostgreSQL + PostGIS** | Per brief. PostGIS makes "posts in this region" / "votes near impact zone" trivial — `postgis/postgis` Docker image is a drop-in. |
| ORM | **Drizzle** | Type-safe, lightweight, great SvelteKit fit, fast to set up. |
| Auth | Hand-rolled sessions + cookies | Simple at this scale; no heavy library. |
| Email | **Resend** | One-line API for OTP delivery. |
| AI | **OpenAI API** | Per brief. Chat completions for notes, moderation endpoint for safety. |
| Deploy | **Docker Compose** | Per brief. Services: `web` (SvelteKit/Node adapter), `db` (PostGIS). |

**Map library call:** MapLibre GL JS. Leaflet is the simpler fallback if the
team hits trouble, but MapLibre's vector rendering gives smoother national→local
zoom and cleaner custom theming. Mapbox GL is rejected — it needs a paid token.

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
  **server-side, debounced, cached in the DB** — never block a request on it.
  A simple in-process queue or a "needs_refresh" flag checked on read is enough
  for 48h; no separate worker service needed.
- All of NZ's geometry ships as static GeoJSON in the app — no GIS server.

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

## 8. The Map — Technical Deep Dive

This is the visual centrepiece and the riskiest UI. Plan it deliberately.

**Rendering NZ.** Don't use map tiles for the home page. Ship a simplified
GeoJSON/TopoJSON of NZ — country outline for national mode, the 16 regional
council boundaries for local mode (source: Stats NZ open data, simplified with
`mapshaper`). MapLibre renders these as styled layers: light-grey fill, darker
outline. Result: exact minimalist aesthetic, instant theming, zero tile
provider, zero API key, tiny payload.

**The connector lines.** This is custom — no map library does it natively.

- An absolutely-positioned **SVG overlay** spans the map *and* the headline list.
- For each visible post: get its screen pixel via `map.project([lng,lat])`, get
  the headline element's `getBoundingClientRect()`, draw a quadratic-bezier path
  between them.
- Recompute on map `move`/`zoom`, on list `scroll`, and on window `resize`.
  Throttle with `requestAnimationFrame`.
- **Clutter control:** cap at ~8–12 connectors, render them faint, highlight one
  on hover. This is also why the side list is "top/trending", not "everything".

**Local mode.** Browser geolocation → lat/lng → point-in-polygon against the
region GeoJSON → that region. Zoom the map to the region's bounding box. Always
provide a manual region dropdown as fallback (geolocation gets denied a lot).

**Marker clustering.** Multiple posts in one city will overlap. MapLibre's
built-in GeoJSON source clustering handles this — enable it from the start.

**Article-view impact map.** A small map zoomed to the post, with the impact
circle drawn as a GeoJSON circle polygon. A light basemap *may* help here for
street context — acceptable to add one minimal vector style on this screen only.

---

## 9. Issues, Risks & Recommended Changes

Ranked by how much they should change the plan.

1. **The "two voting radii" don't carry meaning.** *(design fix — §4.2)*
   A radius is one circle around one point; it can't show where a population of
   voters sits. Replace with a green/red **vote heatmap** if you want vote
   geography, or just rely on the % bar. **Cut the radii concept.** Heatmap is
   nice-to-have, not MVP.

2. **Don't let the AI be the arbiter of truth.** *(design fix — §4.5)*
   "AI gauges credibility" sounds great and is a trap: the model can't verify
   facts and will confidently hallucinate. Real Community Notes are *crowd*
   sourced. Keep roles clean — **crowd vote = verdict, AI = discussion summary.**
   The AI may surface discussion signals ("no sources linked") but never a
   true/false ruling. This also protects you from an awkward demo moment.

3. **Vote brigading.** Open truth-voting invites sock-puppets and pile-ons.
   For 48h, accept it but mitigate cheaply: one vote per verified account,
   account-must-be-email-verified-to-vote. *Strong optional feature that fits the
   theme:* **proximity-weighted votes** — a voter near the impact zone counts for
   more than someone across the country. PostGIS makes this a single distance
   query, and it's a genuinely novel pitch point. Stretch goal.

4. **Connector-line UI is the schedule risk.** *(see §8)* It's the signature
   feature and the most likely thing to eat a day. **Prototype it in the first
   few hours** with fake data. If it isn't working by hour ~20, fall back to
   highlight-on-hover-only (draw a line for the hovered headline alone) — still
   looks great, far less fragile.

5. **Personal vs factual must actually behave differently.** *(design fix)*
   The brief defines the two categories but not divergent behaviour. Make it
   explicit: **personal posts have no vote bar and no community note.** Otherwise
   you're asking the crowd to "verify" someone's garage-sale notice.

6. **Geolocation will be denied/unavailable often.** Always ship the manual
   region picker as a first-class fallback, not an afterthought.

7. **Moderation / abuse.** A platform where anyone posts "news" needs a floor.
   Cheapest effective control: run posts + comments through OpenAI's free
   moderation endpoint, plus a report button. Both are small. Include them.

8. **Privacy of precise location.** A personal post pinned to an exact home
   address can dox someone. Consider snapping personal-post locations to a
   coarser grid, or nudging users to pick a nearby landmark. At minimum, note it.

9. **National feed needs a ranking rule.** "Show all posts" doesn't scale even in
   a demo. Define a simple feed: recent + engagement, capped to the list size.

10. **Real-time updates** (live comments/votes) — tempting, but skip WebSockets.
    Optimistic UI on the voter's own action + a refresh/poll is enough for 48h.

**Ideas worth adding if time allows:**

- **Trending / "what's loud right now"** — a pulse on markers with high recent
  activity. Cheap, makes the map feel alive in the demo.
- **Time scrubber** — replay how a story spread across the map. Great demo
  moment; pure frontend if data has timestamps. Stretch.
- **Follow a region** — get posts from places you care about. Post-hackathon.

---

## 10. Scope Tiers

**MVP — must work in the demo:**
- Signup/login + email OTP verification at signup.
- National map of NZ from GeoJSON, post markers, connector lines to headline list.
- Article view: article left; right tab with impact map, credibility meter, note,
  comments.
- Posting flow: title, body, category, pin location, drag radius.
- Verify/Dispute voting on factual posts; credibility meter.
- Comments.
- AI community note on factual posts (debounced, cached).
- Seeded demo data so the map looks alive.

**Nice-to-have:**
- Local mode with geolocation + region fallback.
- OTP at login (the "2FA toggle").
- Marker clustering.
- OpenAI moderation + report button.
- Reactions.
- Docker Compose deployment.

**Stretch:**
- Vote heatmap on the article map.
- Proximity-weighted votes (PostGIS).
- Trending pulse / time scrubber.
- User profiles.

> If something has to be faked for the demo, fake **deployment** before you fake
> features — judges interact with features, not your Dockerfile.

---

## 11. 48-Hour Plan & Team Split (4+ people)

**Roles**
- **A — Frontend / Map:** home page, NZ GeoJSON rendering, connector-line
  overlay, national/local toggle.
- **B — Frontend / Product:** article view, posting panel, comments UI, the
  design system (minimalist white + gradient).
- **C — Backend:** schema + migrations, auth + OTP, posts/votes/comments
  endpoints, region/geo queries.
- **D — AI + Infra:** OpenAI note service + moderation, Resend wiring, Docker
  Compose, seed data, deployment.

**Timeline**
- **0–4h** — Repo, SvelteKit + Drizzle + PostGIS up, schema agreed, design
  tokens, NZ GeoJSON sourced & simplified. A spikes the connector lines with
  fake data *now*.
- **4–16h** — Parallel build: A map + lines · B article/posting shells ·
  C auth + posts/votes APIs · D OpenAI note service + Docker skeleton.
- **16–30h** — Integration: real data through the map, posting writes to DB,
  voting updates the meter, comments thread live.
- **30–40h** — AI notes wired in and debounced, moderation, local mode,
  polish pass on visuals.
- **40–46h** — Seed realistic NZ data, deploy, end-to-end rehearsal, bug bash.
- **46–48h** — Buffer + pitch/demo script.

**Decision gate at hour 20:** if connector lines aren't solid, drop to
hover-only lines (§9.4) and move on.

---

## 12. Open Questions

- **NZ GeoJSON detail level** — country outline only, or regional boundaries
  too? (Local mode needs regions. Confirm during the 0–4h block.)
- **Login OTP** — every login, or only from new devices? (Every login is
  annoying; "new device" needs device tracking. Suggest: a per-account toggle,
  default off.)
- **Reply depth** — flat comments, or one level of replies? (Recommend one
  level max.)
- **Demo geography** — which region do we showcase in local mode? Pick one and
  seed it densely (likely Auckland or Wellington).
- **Post editing / deletion** — allowed? (Suggest: delete yes, edit no for 48h —
  editing a voted-on factual post undermines the votes.)
