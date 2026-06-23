# ICCOTX CareFlow — FSED Clinical Protocols

A polished, point-of-care clinical protocol reference + **Live Floor Board** for ICCOTX freestanding ERs.

## Features
- **9 color-coded chief-complaint order sets** (chest pain, migraine, SOB, GI, UTI, kidney stones, general/dehydration, stroke, ortho) as fast-scan accordion cards with red-flag alerts.
- **Live search** across protocols, meds, labs, and red flags.
- **Live Floor Board** — start cases by chief complaint + room, log door→ECG / door→provider milestones, set disposition, and watch **real-time KPIs** (active count, cases today, avg door-to-ECG, avg door-to-provider, LWBS %, transfer %). Syncs across every device via Supabase realtime.
- **FAST stroke timer** (door-to-needle ≤60 min) with milestone tracking.
- **Medication dosing quick reference** (searchable).
- **Interactive SIRS sepsis screen**, patient-care workflow strip, smart order-set tabs, universal documentation & clinical-decision-support panels.
- Modern animated light UI, mobile/tablet friendly, print-optimized.

## Stack
- Static single-page app (`index.html`) — no build step.
- [Supabase](https://supabase.com) for the realtime database (table: `public.cases`).
- Deployed on [Vercel](https://vercel.com).

## Configuration
Connection lives in `config.js` (the Supabase anon key is public by design and protected by Row Level Security):

```js
window.ICCOTX_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-key"
};
```

Leave blank to run in **local mode** (data saved only in the current browser) — handy for offline demos.

## Database
Apply `supabase/schema.sql` in the Supabase SQL editor (or via the Management API). It creates the `cases` table, a demo RLS policy (anonymous full access — **demo/fake data only**), and enables realtime.

## Local preview
Any static server works, e.g.:
```
python -m http.server 5176
```
then open http://localhost:5176

---
> Clinical decision support only — does not replace physician judgment. Demo data only.
