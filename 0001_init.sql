-- ICCO TX — staff admin schema
-- Apply with:  npx wrangler d1 execute icco_forms --remote --file=./migrations/0001_init.sql
-- D1 is SQLite. Timestamps are stored as ISO-8601 UTC strings so they sort lexicographically.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- applications: clinicians / staff applying for placement
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
  id               TEXT PRIMARY KEY,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,

  -- applicant
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  email            TEXT NOT NULL,
  phone            TEXT,
  city             TEXT,
  state            TEXT,

  -- role / credentials
  role_applied     TEXT,              -- e.g. 'RN', 'LVN', 'CNA', 'PT', 'Medical Assistant'
  license_type     TEXT,
  license_number   TEXT,              -- treat as sensitive; consider omitting from the public form
  license_state    TEXT,
  years_experience INTEGER,
  availability     TEXT,              -- 'immediate' | '2_weeks' | 'flexible'
  shift_preference TEXT,              -- 'day' | 'night' | 'weekend' | 'any'
  resume_url       TEXT,              -- R2 / external link, if you add uploads later
  message          TEXT,

  -- workflow
  status           TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','reviewing','interview','placed','rejected','archived')),
  assigned_to      TEXT,
  staff_notes      TEXT,

  -- provenance (useful for marketing attribution and abuse triage)
  source_page      TEXT,
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  ip_country       TEXT,
  user_agent       TEXT
);

CREATE INDEX IF NOT EXISTS idx_applications_created  ON applications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_status   ON applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_email    ON applications (email);
CREATE INDEX IF NOT EXISTS idx_applications_role     ON applications (role_applied);

-- ---------------------------------------------------------------------------
-- enquiries: facilities / general contact form
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enquiries (
  id               TEXT PRIMARY KEY,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,

  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  phone            TEXT,
  organization     TEXT,
  enquiry_type     TEXT NOT NULL DEFAULT 'general'
                   CHECK (enquiry_type IN ('staffing','general','partnership','billing','careers','other')),
  subject          TEXT,
  message          TEXT NOT NULL,

  status           TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','in_progress','responded','closed','spam')),
  assigned_to      TEXT,
  staff_notes      TEXT,

  source_page      TEXT,
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  ip_country       TEXT,
  user_agent       TEXT
);

CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_status  ON enquiries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_email   ON enquiries (email);
CREATE INDEX IF NOT EXISTS idx_enquiries_type    ON enquiries (enquiry_type);

-- ---------------------------------------------------------------------------
-- admin_audit: who looked at / changed what. Applicant PII is regulated-adjacent,
-- so keep a trail even though this is not a HIPAA-covered system of record.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL,
  actor_email  TEXT NOT NULL,        -- from the Cloudflare Access JWT
  action       TEXT NOT NULL,        -- 'list' | 'view' | 'status_change' | 'note' | 'export'
  entity       TEXT,                 -- 'applications' | 'enquiries'
  entity_id    TEXT,
  detail       TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON admin_audit (actor_email, created_at DESC);

-- ---------------------------------------------------------------------------
-- submission_throttle: crude per-IP-hash rate limiting for the public endpoints.
-- Rows are disposable; prune anything older than an hour on write.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submission_throttle (
  ip_hash    TEXT NOT NULL,
  form       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_throttle_lookup ON submission_throttle (ip_hash, form, created_at);
