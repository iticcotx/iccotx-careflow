# ICCO TX staff dashboard — build & staging runbook

A `/staff/` admin for **Applications** and **Enquiries** on an Astro + Cloudflare site.
No webinar sign-ups, no user table, no password storage: Cloudflare Access does the
identity work and this code verifies its signed token.

Everything here was type-checked (`astro check`, 0 errors) and run end-to-end against a
real local D1 database with `wrangler dev` before it was handed over.

---

## 1. File structure

Drop these into your repo exactly as laid out. Paths matter — Astro routes are the
file system.

```
iccotx/
├─ astro.config.mjs              ← reference only; copy the adapter block if missing
├─ wrangler.jsonc                ← Workers deploys  (use wrangler.pages.jsonc for Pages)
├─ migrations/
│  └─ 0001_init.sql              ← D1 schema
├─ examples/
│  └─ PublicForms.astro          ← markup your existing forms need to match
└─ src/
   ├─ env.d.ts                   ← merge App.Locals into your existing file
   ├─ middleware.ts              ← Access gate for /staff and /api/staff
   ├─ lib/
   │  ├─ runtime.ts              ← the ONLY file that differs Astro 5 vs Astro 6
   │  ├─ access.ts               ← Cloudflare Access JWT verification (jose)
   │  ├─ db.ts                   ← every D1 query; parameterised, allow-listed
   │  ├─ validate.ts             ← form parsing, validation, honeypot
   │  └─ notify.ts               ← optional "new submission" email
   └─ pages/
      ├─ api/
      │  ├─ applications.ts      ← POST, public intake
      │  ├─ enquiries.ts         ← POST, public intake
      │  └─ staff/
      │     ├─ submissions.ts    ← GET list + single record  (protected)
      │     ├─ update.ts         ← POST status / assignee / notes (protected)
      │     └─ export.ts         ← GET CSV of current filters (protected)
      └─ staff/
         └─ index.astro          ← the dashboard
```

### Why this shape

- **`src/pages/api/*`** — Astro endpoints compile into the same Worker as the site, so
  there is no second service to deploy, no CORS, and the D1 binding is already in scope.
- **`src/middleware.ts`** — one gate in front of every staff route. Adding a new page
  under `/staff/` is automatically protected; you cannot forget an auth check.
- **`src/lib/*`** — no SQL or auth logic lives in a route file. The routes are thin.
- **`migrations/`** — `wrangler d1 migrations` reads this directory by convention.

---

## 2. Database schema (Cloudflare D1)

D1 is SQLite at the edge, and it is the right store here: submissions are small,
write-light, read-often, and already inside Cloudflare.

Four tables, in `migrations/0001_init.sql`:

| Table | Purpose |
|---|---|
| `applications` | Clinician applications. Workflow: `new → reviewing → interview → placed / rejected / archived` |
| `enquiries` | Facility and general contact. Workflow: `new → in_progress → responded → closed / spam` |
| `admin_audit` | Who listed, viewed, changed or exported what, stamped with the Access email |
| `submission_throttle` | Hashed-IP rate limiting for the public endpoints |

Design decisions worth knowing:

- **IDs are `app_…` / `enq_…` strings**, not autoincrement integers — an ID in a URL or
  an email shouldn't leak how many applicants you have.
- **Timestamps are ISO-8601 UTC text.** They sort lexicographically in SQLite, so
  `ORDER BY created_at DESC` and date-range filters work without date functions.
- **`CHECK` constraints on `status`** — the database refuses an invalid status even if a
  future endpoint forgets to validate.
- **Indexes on `created_at`, `(status, created_at)`, `email`** cover every query the
  dashboard makes. Search uses `LIKE` across a fixed column list, which is the right
  call up to roughly 50k rows; past that, move to SQLite FTS5.
- **`license_number` is stored but never returned by the list API** — only in the single-
  record view. Consider dropping the field from the public form entirely unless you
  actually need it before an interview.
- **IPs are hashed, not stored.** Same throttling value, less PII sitting at rest.

---

## 3. Before you start: which stack are you on?

Two things decide the rest. Check both in the Cloudflare dashboard and in `package.json`.

**Pages or Workers?** Dashboard → Compute (Workers) → your project.
A *Deployments* tab with `*.pages.dev` URLs = **Pages**. A *Versions* tab plus
Settings → Build = **Workers Builds**. Both are covered below.

**Astro 5 or Astro 6?** In the repo, `package.json`:
`"astro": "^5.x"` with `"@astrojs/cloudflare": "^12.x"` = **Astro 5**.
`"astro": "^6.x"` with `"@astrojs/cloudflare": "^13/14.x"` = **Astro 6**.

The files ship configured for **Astro 5**. For Astro 6, edit `src/lib/runtime.ts`:
delete the `getEnv` function and uncomment the two lines below it (Astro 6 removed
`Astro.locals.runtime`; bindings come from `cloudflare:workers` instead). Also delete the
`runtime:` line in `src/env.d.ts`. That is the whole migration — nothing else changes.

---

## 4. Step-by-step: staging branch → preview link → production

You said you're adding files through GitHub's web UI without a local checkout. These
steps assume that.

### Step 1 — Create the branch

On GitHub: repo → branch dropdown → type `staging` → **Create branch: staging from main**.

Then switch the file browser to the `staging` branch before you add anything. Every
"Commit changes" dialog from here on must have **"Commit directly to the staging
branch"** selected. This is the single most important click in the process — it is what
keeps production untouched.

### Step 2 — Add the files

Use **Add file → Create new file** and type the full path into the filename box
(e.g. `src/lib/runtime.ts`); GitHub creates the folders for you. Add, in this order:

1. `migrations/0001_init.sql`
2. `src/lib/runtime.ts`, `access.ts`, `db.ts`, `validate.ts`, `notify.ts`
3. `src/middleware.ts` — **if `src/middleware.ts` already exists**, don't replace it.
   Paste the body of this `onRequest` at the top of yours, or combine them with Astro's
   `sequence()` helper.
4. `src/pages/api/applications.ts`, `src/pages/api/enquiries.ts`
5. `src/pages/api/staff/submissions.ts`, `update.ts`, `export.ts`
6. `src/pages/staff/index.astro`
7. `src/env.d.ts` — merge into yours if it exists.
8. `wrangler.jsonc` (or `wrangler.pages.jsonc`, renamed) — merge into yours if it exists;
   keep your existing `name`, `compatibility_date` and any bindings already there.

### Step 3 — Add the two dependencies

Edit `package.json` on the `staging` branch and add to `dependencies`:

```json
"@astrojs/cloudflare": "^12.6.13",
"jose": "^6.2.12"
```

(`@astrojs/cloudflare` is almost certainly already there. `jose` is the only genuinely
new package — it's the library Cloudflare's own docs use for Access JWT verification.)

If your repo has a `package-lock.json`, the Cloudflare build runs `npm ci`, which will
fail on a lockfile that doesn't match. Two options: change the build command to
`npm install && npm run build` for the staging build, or run `npm install` locally once
and commit the updated lockfile. The first is faster; the second is tidier.

### Step 4 — Create the databases and load the schema

From any machine with the repo checked out, or Cloudflare's dashboard console. CLI:

```bash
npx wrangler login

# Two databases: real data and staging data never mix.
npx wrangler d1 create icco-forms
npx wrangler d1 create icco-forms-staging
```

Each prints a `database_id`. Paste them into `wrangler.jsonc` (production id in the top
block, staging id in `env.staging`, or as `preview_database_id` on Pages), commit that
change to `staging`, then load the schema:

```bash
npx wrangler d1 execute icco-forms-staging --remote --file=./migrations/0001_init.sql
# production, only when you're ready to go live:
npx wrangler d1 execute icco-forms --remote --file=./migrations/0001_init.sql
```

No CLI available? Dashboard → Storage & Databases → D1 → **Create**, then open the
database → **Console** and paste the contents of `0001_init.sql`.

**The binding name must be `DB`** — that is what `src/lib/runtime.ts` reads.

### Step 5 — Wire the bindings

**Pages:** Workers & Pages → `iccotx` → Settings → Bindings. Add a **D1 database**
binding named `DB` twice: under *Production* point it at `icco-forms`, under *Preview*
point it at `icco-forms-staging`. Add the same-named plaintext variables to both
environments: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `ENVIRONMENT`.

**Workers:** it's all in `wrangler.jsonc` — production at the top level, staging under
`env.staging`. Set the staging build's deploy command to
`npx wrangler versions upload --env staging` so a staging build can never promote itself
to production.

### Step 6 — Set up Cloudflare Access

Zero Trust → Access → Applications → **Add an application** → *Self-hosted*.

- **Application domain:** `iccotx.com`, path `staff` (add a second entry for path `api/staff`).
- **Policy:** Allow → *Emails ending in* `@wcgtx.com`, or an explicit email list. Add
  your own address first so you can't lock yourself out.
- **Identity provider:** one-time PIN works with zero setup; Google/Microsoft SSO is
  better if you already have it.
- After saving: Configure → Additional settings → copy the **Application Audience (AUD)
  tag**. That string goes into `CF_ACCESS_AUD`.
- `CF_ACCESS_TEAM_DOMAIN` is `https://<your-team>.cloudflareaccess.com`, no trailing slash.

For the preview URL, do one of:

- **Pages:** Settings → General → **Enable access policy**. This protects hash-based
  preview deployments (`<hash>.iccotx.pages.dev`) with your Access policies. Note it
  covers the whole preview site, not just `/staff` — fine for staging.
- **Either product:** create a second Access application for the preview hostname and
  use *its* AUD in the staging variables. This is the one I'd pick, because it exercises
  the exact same JWT code path you'll run in production.

If `CF_ACCESS_AUD` is missing or wrong, `/staff` returns 403 for everyone. The gate fails
closed by design — a misconfiguration never reads as "allowed".

### Step 7 — Get the preview link

Push to `staging` and the build starts on its own.

- **Pages** gives you `staging.iccotx.pages.dev` (branch alias, always latest) plus a
  permanent per-commit `<hash>.iccotx.pages.dev`. Nothing points at `iccotx.com`.
  Previews carry `X-Robots-Tag: noindex` automatically.
- **Workers Builds** creates a *version* for non-production branches. Open Deployments →
  Versions → the new version → its **preview URL**. As long as the deploy command is
  `wrangler versions upload`, the version is never promoted.

### Step 8 — Smoke test on the preview link

Work through this before you go near `main`:

- [ ] Submit the public application form → `{"ok":true,"id":"app_…"}`
- [ ] Submit the enquiry form → `{"ok":true,"id":"enq_…"}`
- [ ] Open `/staff/` in a private window → Cloudflare Access login appears
- [ ] Sign in → both submissions are listed under the right tab
- [ ] Search a partial surname, an email fragment, a phone number
- [ ] Filter by status, set a date range, change rows-per-page, page forward and back
- [ ] Open a record, change status, assign it, save a note → reopen, changes persisted
- [ ] Export CSV → opens in Excel with correct headers
- [ ] `curl https://<preview>/api/staff/submissions?entity=applications` with no
      browser session → `401`, not data
- [ ] `SELECT * FROM admin_audit` on the staging DB → your email against each action

### Step 9 — Promote to production

1. Apply the migration to the production database (Step 4) if you haven't.
2. Confirm production `CF_ACCESS_AUD` / `CF_ACCESS_TEAM_DOMAIN` are set on the
   *production* environment, not just preview.
3. Open a PR from `staging` → `main`, review the diff, merge.
4. Point the live forms at `/api/applications` and `/api/enquiries`
   (see `examples/PublicForms.astro` for the markup contract).
5. Test one real submission on production, then check `/staff/`.

**Rollback:** Pages → Deployments → previous deployment → *Rollback*. Workers →
Deployments → previous version → *Promote*. Either takes seconds. The database is
unaffected by a rollback — the tables are additive and nothing in this bundle drops data.

---

## 5. Local development

```bash
npm install
npx wrangler d1 execute icco-forms --local --file=./migrations/0001_init.sql
npx wrangler types          # writes worker-configuration.d.ts (D1Database types)
npm run build && npx wrangler dev --local
```

To skip the Access login locally, create `.dev.vars` (git-ignored, never committed):

```
STAFF_DEV_BYPASS=true
CF_ACCESS_AUD=
CF_ACCESS_TEAM_DOMAIN=
```

The bypass only fires when `STAFF_DEV_BYPASS=true` **and** `CF_ACCESS_AUD` is empty, so
it cannot be triggered on a deployed environment that has Access configured.

---

## 6. What this protects against, and what it doesn't

Handled:

- Unauthenticated access to `/staff` and `/api/staff` — JWT verified against Cloudflare's
  rotating JWKS, `iss` and `aud` both checked, fails closed on misconfiguration.
- SQL injection — every value is bound; table names, sort columns and statuses come from
  fixed allow-lists. Verified with injection attempts against the running endpoints.
- XSS in the dashboard — all row data is HTML-escaped before it reaches `innerHTML`.
- CSRF on staff mutations — cross-origin `POST` is rejected before it reaches a handler.
- Spam — honeypot field, a sub-2.5-second submit trap, and hashed-IP rate limiting
  (5/hour applications, 8/hour enquiries).
- CSV formula injection — cells starting `=`, `+`, `-`, `@` are prefixed on export.
- Search-engine indexing of `/staff` — `noindex` header and meta tag.
- Accountability — every list, view, change and export is written to `admin_audit`.

Deliberately not included, flag it if you want any of these:

- **File uploads for résumés.** The schema has `resume_url` ready for R2, but accepting
  uploads means virus scanning and signed URLs — a separate piece of work.
- **Turnstile.** The honeypot stops commodity bots. If you get targeted spam, Turnstile
  is the next step and takes about twenty minutes.
- **Bulk actions and saved views.** Easy to add once you see how staff actually use it.
- **PHI.** Nothing here is built to hold patient data. Applicant PII only. If a workflow
  ever puts clinical information into these tables, that's a different conversation about
  BAAs and encryption at rest.

One practical note: applicant records accumulate PII you have no reason to keep forever.
A scheduled Worker that archives or purges rejected applications after 12–24 months is
worth adding before this has been running a year.
