# Clinical Onboarding App — Build Spec (v1)

> (C) Written by Claude — Oct 8, 2026. Source of truth for the v1 build.
> Vault notes: `~/Obsidian/Tommy's OS/03 Work/Apps/Clinician Onboarding/CLAUDE.md`

An onboarding web app for counselling and therapy practices, sold as a subscription.
**Clinicians** sign in, watch video lessons grouped into weeks, download resources, answer
quick-check questions and tick off a checklist. **Practice owners** load their own content,
invite staff and see who has finished. **The Well** (Dr. Angela Claffey) is the first practice
and the seed data.

---

## 1. Stack and layout

```
clinical-onboarding/
├── package.json          one package; scripts below
├── server/               Node 22+, ZERO runtime deps, ESM (.mjs)
│   ├── index.mjs         startServer({ port, dataDir }) -> { server, close() }; CLI entry
│   ├── db.mjs            node:sqlite (DatabaseSync), schema + migrations
│   ├── auth.mjs          scrypt hashing, sessions, login rate limit
│   ├── routes/*.mjs      one file per area (auth, learner, admin, files)
│   ├── http.mjs          tiny router, JSON helpers, cookie parsing, body limits
│   └── seed.mjs          `npm run seed` -> The Well demo practice
├── test/*.test.mjs       node --test, against startServer() on a temp dataDir
├── src/                  Vite + React 19 + TypeScript front end
├── index.html
├── vite.config.ts        dev proxy /api -> http://127.0.0.1:4500
├── data/                 git-ignored: app.db, uploads/
└── dist/                 git-ignored: built front end, served by the Node server in prod
```

**Scripts**
| Script | Does |
|---|---|
| `npm run dev` | runs server (port 4500) and Vite (5173) together |
| `npm run server` | `node server/index.mjs` |
| `npm run seed` | wipes `data/` and seeds The Well |
| `npm test` | `node --test test/` then `vitest run` |
| `npm run build` | `tsc -b && vite build` |
| `npm start` | production: Node serves `dist/` + `/api` on `$PORT` (default 4500) |

Front-end deps: react, react-dom, react-router-dom (v7). Dev: vite, @vitejs/plugin-react,
typescript ~6, vitest, jsdom, @testing-library/react, @types/*. **No UI kit. No CSS framework.**
Plain CSS with custom properties.

---

## 2. Data model (SQLite)

Every table except `practices` and `sessions` carries `practice_id`. **Every query a signed-in
user triggers is filtered by the user's own `practice_id`.** Never trust an id from the client
without that filter. This is the single most important rule in the app.

```sql
practices(id INTEGER PK, name TEXT, slug TEXT UNIQUE, brand_color TEXT DEFAULT '#22688A',
          logo_url TEXT, created_at TEXT)
users(id INTEGER PK, practice_id INT, email TEXT UNIQUE COLLATE NOCASE, name TEXT,
      title TEXT, role TEXT CHECK(role IN ('owner','admin','clinician')),
      password_hash TEXT, active INT DEFAULT 1, created_at TEXT, last_seen_at TEXT)
invites(token_hash TEXT PK, practice_id INT, email TEXT, name TEXT, title TEXT, role TEXT,
        created_by INT, created_at TEXT, expires_at TEXT, accepted_at TEXT)
sessions(token_hash TEXT PK, user_id INT, created_at TEXT, expires_at TEXT)
weeks(id INTEGER PK, practice_id INT, position INT, title TEXT, subtitle TEXT)
lessons(id INTEGER PK, practice_id INT, week_id INT, position INT, title TEXT,
        label TEXT,             -- e.g. "FAITH-INTEGRATED CARE"
        presenter TEXT, duration_min INT, video_url TEXT, poster_url TEXT,
        overview TEXT, takeaways TEXT,   -- JSON array of strings
        transcript TEXT, updated_at TEXT)
quiz_questions(id INTEGER PK, practice_id INT, lesson_id INT, prompt TEXT,
               options TEXT,    -- JSON array of strings
               correct_index INT, explanation TEXT)
resources(id INTEGER PK, practice_id INT, lesson_id INT NULL, category TEXT,  -- 'Resource' | 'Policy'
          title TEXT, file_type TEXT, size_bytes INT, stored_name TEXT, created_at TEXT,
          page_count INT, preview_name TEXT, updated_at TEXT)   -- v13 (Oct 18): card preview + meta
checklist_items(id INTEGER PK, practice_id INT, position INT, title TEXT, detail TEXT)
lesson_progress(user_id INT, lesson_id INT, practice_id INT, status TEXT,  -- 'started'|'complete'
                position_sec INT DEFAULT 0, quiz_correct INT, completed_at TEXT,
                PRIMARY KEY(user_id, lesson_id))
checklist_done(user_id INT, item_id INT, practice_id INT, done_at TEXT, PRIMARY KEY(user_id,item_id))
notes(user_id INT, lesson_id INT, practice_id INT, body TEXT, updated_at TEXT, PRIMARY KEY(user_id,lesson_id))
questions(id INTEGER PK, practice_id INT, user_id INT, lesson_id INT NULL, body TEXT,
          created_at TEXT, resolved_at TEXT)
```

---

## 3. Security rules (non-negotiable)

- Passwords: `crypto.scrypt`, 16-byte random salt, stored as `scrypt$N$r$p$salt$hash`. Min length 10.
- Sessions: 32 random bytes, cookie `coa_session`, `HttpOnly; SameSite=Lax; Path=/`, `Secure` when
  `NODE_ENV=production`. Store **only the SHA-256 hash** of the token. 14-day expiry.
- Invite tokens: same approach (store hash only). 7-day expiry. One use.
- **Writes** (POST/PUT/DELETE) require header `X-COA: 1` and, if an `Origin` header is present,
  it must match the request host. Otherwise 403. (Same pattern as Queue's `X-Queue: 1`.)
- Login rate limit: 8 failures per email+IP per 15 min -> 429. Same error message for wrong email
  and wrong password ("Email or password is incorrect").
- JSON body limit 1 MB. Upload limit 25 MB. Uploads: allow only pdf, docx, doc, xlsx, pptx, zip,
  png, jpg, txt, mp4; store under `data/uploads/<practice_id>/<random>.<ext>`; never use the
  client's filename on disk.
- Downloads are streamed only after the practice check. `Content-Disposition: attachment`.
- Role checks: `/api/admin/*` needs owner or admin. Changing practice settings/billing: owner only.
- Never return `password_hash`, token hashes, or another practice's rows. Deactivated users can't log in.
- Production static server: serve only files inside `dist/`, SPA fallback to index.html,
  `/healthz` -> 200. Security headers: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`.

---

## 4. API contract

All JSON. Errors: `{ "error": "Human sentence." }` with the right status (400/401/403/404/409/429).
Dates are ISO strings. `me` shape everywhere:
`{ id, name, email, title, role, initials }`; `practice` shape:
`{ id, name, slug, brandColor, logoUrl }`.

### Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | /api/auth/login | {email,password} | {me, practice} + cookie |
| POST | /api/auth/logout | — | {ok:true} |
| GET | /api/me | — | {me, practice} or 401 |
| POST | /api/signup | {practiceName,name,email,password} | {me, practice} (new practice, role owner) |
| GET | /api/invites/:token | — | {email,name,practiceName} or 404 |
| POST | /api/invites/:token/accept | {name,password} | {me, practice} + cookie |

### Learner (any signed-in role)
| Method | Path | Returns |
|---|---|---|
| GET | /api/dashboard | see below |
| GET | /api/weeks | `[{id,title,subtitle,lessons:[LessonCard]}]` |
| GET | /api/lessons/:id | `{lesson, week, quiz:[{id,prompt,options}], resources:[Resource], progress, note, prevId, nextId, position:{index,total}}` (no correct_index!) |
| POST | /api/lessons/:id/progress | body {positionSec} -> marks started -> {ok} |
| POST | /api/lessons/:id/complete | -> {ok, nextId} |
| POST | /api/quiz/:id/answer | body {index} -> {correct, correctIndex, explanation} ; records quiz_correct |
| PUT | /api/lessons/:id/note | body {body} -> {ok, updatedAt} |
| POST | /api/checklist/:id | body {done:boolean} -> {ok} |
| GET | /api/resources | `[Resource]` (all for practice) |
| GET | /api/resources/:id/download | file stream |
| GET | /api/team | `[{id,name,title,role,initials}]` active users in practice |
| POST | /api/questions | body {lessonId?, body} -> {ok} |

`LessonCard = {id,title,durationMin,label,status:'not_started'|'started'|'complete', posterUrl}`
`Resource = {id,title,fileType,sizeLabel,category,lessonId,pages,updatedAt,previewUrl}` (sizeLabel like "2.4 MB"; pages null when unknown; previewUrl = `/api/resources/:id/preview`, a PNG of page 1, or null → the card shows a type illustration)

`GET /api/dashboard` ->
```json
{ "me": {}, "practice": {},
  "progress": { "done": 3, "total": 9, "percent": 33, "minutesLeft": 120 },
  "continue": { "lesson": LessonCard, "weekTitle": "Week 1 · Foundations", "position": {"index":4,"total":9}, "presenter": "", "overview": "" } | null,
  "path": [ { "weekId": 1, "title": "Week 1", "subtitle": "Foundations", "lessons": [LessonCard] } ],
  "checklist": [ { "id": 1, "title": "", "done": true } ],
  "people": [ { "id": 1, "name": "", "title": "", "initials": "" } ],
  "resources": [Resource]   // first 6
}
```

### Admin (owner/admin)
| Method | Path | Notes |
|---|---|---|
| GET | /api/admin/team | users + pending invites, each user with `{progressPercent, lessonsDone, checklistDone, lastSeenAt}` |
| POST | /api/admin/invites | {email,name,title,role} -> {inviteUrl} (url `/invite/<token>`; no email sending in v1, owner copies the link) |
| DELETE | /api/admin/invites/:email | revoke pending invite |
| PUT | /api/admin/users/:id | {role?, title?, active?} (can't demote/deactivate the last owner or yourself) |
| GET | /api/admin/content | weeks with lessons (full fields), checklist, resources |
| POST/PUT/DELETE | /api/admin/weeks[/:id] | {title,subtitle,position} |
| POST/PUT/DELETE | /api/admin/lessons[/:id] | {weekId,title,label,presenter,durationMin,videoUrl,posterUrl,overview,takeaways[],transcript,position} |
| PUT | /api/admin/lessons/:id/quiz | replaces quiz: [{prompt,options[],correctIndex,explanation}] |
| POST | /api/admin/resources | raw body upload; query `?title=&category=&lessonId=&filename=` ; header Content-Type |
| DELETE | /api/admin/resources/:id | deletes row + file |
| POST/PUT/DELETE | /api/admin/checklist[/:id] | {title,detail,position} |
| GET | /api/admin/questions | open + resolved, with asker name + lesson title |
| POST | /api/admin/questions/:id/resolve | |
| PUT | /api/admin/practice | owner only: {name, brandColor, logoUrl} |

---

## 5. Screens (front end)

Routes (react-router):
| Route | Screen | Who |
|---|---|---|
| /signin | Sign in | public |
| /signup | Start a practice (name, your name, email, password) | public |
| /invite/:token | Accept invite: set name + password | public |
| / | Dashboard | signed in |
| /onboarding | All weeks + lessons (the "My onboarding" path) | signed in |
| /lesson/:id | Lesson | signed in |
| /resources | Resource library, filter All / Resources / Policies | signed in |
| /team | Team directory | signed in |
| /support | Ask a question (+ my past questions) | signed in |
| /admin | Admin home: team progress table + pending questions | owner/admin |
| /admin/team | Invite, roles, deactivate, copy invite link | owner/admin |
| /admin/content | Weeks → lessons editor, quiz editor, resource upload, checklist editor | owner/admin |
| /admin/settings | Practice name, brand colour, logo URL | owner |

**Design reference — match these exactly for the clinician screens.** The approved designs exist
as Framer-ready XML (tag names are layer names; attributes are the real values):
- `/tmp/fr/signin_0.xml` — sign in
- `/tmp/fr/dash_0.xml` — dashboard (app shell + sidebar, greeting + progress card, continue card,
  path card, checklist, your people, resource library)
- `/tmp/fr/lesson_0.xml` — lesson (player, title, tabs Overview/Transcript/My notes, takeaways,
  quick check, prev/next, side column with week list, lesson resources, ask card)
- `/tmp/fr/bp_rules.py` — how each screen changes at Laptop 1025 / Tablet 700 / Phone 390
  (functions `shell()`, `R['dash']`, `R['lesson']`, `R['signin']`)

Admin screens have no design: build them in the same system (white cards radius 24 on Taupe,
same type and buttons, tables with 1px Rule dividers).

**Responsive:** breakpoints `max-width: 1199px` (laptop), `809px` (tablet), `479px` (phone).
Below 810px the sidebar becomes a top bar with a horizontally scrolling nav; the user card hides.
Video players are **exactly 16:9** (`aspect-ratio: 16 / 9`). No horizontal page scroll at 390px.

---

## 6. Design tokens (from the live Framer project)

```css
--slate: #3F474A;        /* rgb(63,71,74)   headings, primary buttons */
--body: #646B6D;         /* rgb(100,107,109) body text */
--taupe: #F8F5F1;        /* page background */
--rule: #E9E5E0;         /* borders, dividers */
--blue: #B0E3F6;         /* accent fill, progress */
--blue-deep: #22688A;    /* links, active nav, labels, file tiles */
--media: #ECE4DA;        /* placeholder/media fill */
--border-ghost: rgba(34,104,138,.55);
--white: #FFFFFF;
```
- **Brand colour override:** `practice.brandColor` replaces `--blue-deep` at runtime. Reject
  colours that fail 4.5:1 against white in the settings form (show the ratio).
- Fonts (Google Fonts): **Fraunces (soft, lining numerals; was Cormorant Garamond until Oct 9)** 500 (display/card titles, italic 300 for quotes),
  **Inter** 400/500 (everything else).
- Type: Display lg 52/1.06 · Display md 41/1.08 · Card serif 24/1.2 · Row title 16/1.4 (500) ·
  Body md 16/1.65 · Body sm 14/1.65 · Body xs 13/1.5 · Label 11px 500 letter-spacing .16em uppercase
  Blue Deep · Meta 13 500 · Nav item 15 · Btn 15 500 letter-spacing .02em.
  Tablet: Display lg 40, Display md 32. Phone: Display lg 34, Display md 28.
- Buttons: pill radius 999. Primary = Slate fill, white text, padding 16/28. Ghost = transparent,
  1px `--border-ghost`, Blue Deep text, padding 14/26.
- Cards: white, radius 24–26, no shadow. Inputs: white, 1px Rule, radius 14, padding 15/18.
- Label pattern: 3px Blue Deep dot + uppercase label (no ring outline).

**Contrast (checked Oct 8):** every pair passes 4.5:1 **except Body (#646B6D) on Media (#ECE4DA) =
4.31 — never put body-grey text on Media**; use Slate there. Text over video/photos always gets a
dark overlay `rgba(28,32,34,.55)` and white text.

---

## 6b. Multi-industry (added Oct 8 — groundwork for "Onboarding Buddy")

Nothing in the UI is therapy-specific. Each organisation stores:
- `practices.terms` (JSON): `portal, member, members, lead, org, checklist` — e.g. The Well:
  "Clinician portal / clinician / clinicians / supervisor / practice / Before your first client".
  New sign-ups get general defaults ("Team portal / team member / … / manager / company / Before your first day").
  Owner edits them in Settings, with presets (company, therapy practice, church, trades).
- `welcome_quote`, `welcome_quote_ref`, `welcome_photo_url`: the org's own sign-in panel.
- Public `GET /api/orgs/:slug` → `{name, slug, brandColor, logoUrl, terms, welcome}` powers
  `/signin?org=<slug>`; the last org signed into is remembered on the device.
- Product name lives in one constant: `src/lib/brand.ts` → `PRODUCT_NAME`.
- Internal role value stays `'clinician'` in the database; the UI always shows `terms.member`.

## 6c. Sign in with Google / Microsoft (added Oct 8)

- Invites decide who gets in; Google/Microsoft prove identity. Code: `server/oidc.mjs` (OIDC + PKCE, RS256
  verified against provider keys, no deps), `server/routes/oauth.mjs`, tests `test/oauth.test.mjs` (fake provider).
- Tables: `user_identities(provider, subject → user)`, `oauth_states` (state hash, PKCE verifier, nonce, invite, 10 min).
- Rules: invite + matching email → account; linked identity → sign in; verified Google email → link;
  Microsoft email is never trusted alone (nOAuth). Sessions: SSO 12 h, password 7 days.
- Per-org `practices.signin_methods` {password, google, microsoft}; owner can't remove their only method.
- Env: `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`, `PUBLIC_ORIGIN`. Setup steps: `docs/SSO-SETUP.md`.
- Account page `/account`: connect/disconnect providers.

## 6d. Questions, replies and notifications (added Oct 8)

- `question_replies` thread per question: the asker can follow up (reopens a resolved question), staff can answer.
  Other members get 404. `GET /api/questions` and `/api/admin/questions` include `replies[]`.
- `notifications` + bell: new question → owners/admins; staff answer → asker; follow-up → staff; new lesson →
  everyone but the author. `GET /api/notifications`, `POST /api/notifications/read {ids?}`. Email alerts hook into
  `server/notify.mjs` once an email service exists.
- `practices.client_messaging` `{label, url}`: "About a client? Message your supervisor in SimplePractice."
  SimplePractice has no public API, so this is a link, not a sync. Shown on Support and the lesson ask card.

## 7. Seed: The Well

Practice "The Well", brandColor #22688A, logo
`https://raw.githubusercontent.com/tommyclaffey/thewell-assets/main/real/the-well-logo.png`.

Users (password for all: `welcome-to-the-well`, printed by the seed script):
- angela@thewell.test — Dr. Angela Claffey, Clinical supervisor, **owner**
- office@thewell.test — Office manager, "Scheduling, payroll and keys", admin
- jordan@thewell.test — Jordan Lee, Associate clinician, clinician (3 of 9 lessons complete,
  lesson 4 started at 7:12, checklist 2 of 5 done)

Weeks: 1 Foundations (4 lessons), 2 Intake and informed consent (3), 3 Your first clients (2).
Week 1 lessons: "Welcome from Dr. Claffey" 6 min · "Our story and mission" 11 · "HIPAA and client
privacy" 22 · "Faith-integrated care: our model" 18 (label FAITH-INTEGRATED CARE; overview,
3 takeaways and the quiz exactly as in `/tmp/fr/lesson_0.xml`). Invent sensible titles for weeks
2–3. Poster for all: `https://raw.githubusercontent.com/tommyclaffey/thewell-assets/main/real/angela-room-wide.jpg`.
`video_url` empty (player shows the poster + "Video coming soon" when empty; plays `<video>` for
.mp4 URLs and an iframe for Vimeo/YouTube URLs).

Checklist: Sign your employment agreement · Upload license and liability insurance (to the office,
not this app) · Set up your EHR login · Shadow a session with your supervisor · Read the clinician handbook.

Resources (generate small placeholder files): Clinician handbook (PDF) · Informed consent template
(DOCX) · New client intake packet (PDF) · Crisis and safety protocol (PDF, category Policy) ·
Session note templates (DOCX) · Brand kit and email signature (ZIP) · plus the 3 lesson-4
resources from the lesson design.

Mark all seed content clearly as **placeholder** in the README — Angela supplies the real lessons.
