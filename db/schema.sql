-- Base schema for fresh databases. Additive changes since 2026.2 live in lib/migrations.ts and are
-- applied automatically whenever the app or seed script opens the database.
-- SOLARekta MVP schema (SQLite)
-- Every table carries ownership, timestamps and lifecycle state. Money is PHP centavos-free
-- (whole pesos) for readability in the MVP; production migration should use numeric(14,2).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','installer','supplier','admin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_type    TEXT NOT NULL DEFAULT 'homeowner' CHECK (account_type IN ('homeowner','business')),
  address         TEXT,
  city            TEXT,
  province        TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS installers (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name       TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  about               TEXT,
  website             TEXT,
  phone               TEXT,
  service_areas_json  TEXT NOT NULL DEFAULT '[]',
  verification_status TEXT NOT NULL DEFAULT 'draft'
                      CHECK (verification_status IN ('draft','pending','verified','rejected','suspended')),
  verified_at         TEXT,
  license_no          TEXT,
  years_experience    INTEGER,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_installers_status ON installers(verification_status);

CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key   TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  sha256        TEXT NOT NULL,
  purpose       TEXT NOT NULL DEFAULT 'bill',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_user_id);

CREATE TABLE IF NOT EXISTS sites (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  address            TEXT,
  city               TEXT NOT NULL,
  province           TEXT,
  property_type      TEXT NOT NULL DEFAULT 'residential'
                     CHECK (property_type IN ('residential','commercial','industrial')),
  ownership          TEXT NOT NULL DEFAULT 'owner' CHECK (ownership IN ('owner','tenant','other')),
  roof_type          TEXT NOT NULL DEFAULT 'concrete'
                     CHECK (roof_type IN ('concrete','metal','tile','asbestos','unknown')),
  roof_area_m2       REAL NOT NULL,
  roof_age_years     INTEGER,
  daytime_usage      TEXT NOT NULL DEFAULT 'medium' CHECK (daytime_usage IN ('low','medium','high')),
  monthly_budget_php INTEGER,
  utility_provider   TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);

CREATE TABLE IF NOT EXISTS electricity_bills (
  id                   TEXT PRIMARY KEY,
  site_id              TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider             TEXT NOT NULL,
  billing_period_start TEXT,
  billing_period_end   TEXT,
  monthly_kwh          REAL NOT NULL,
  total_php            REAL NOT NULL,
  generation_charge_php REAL,
  fixed_charges_php    REAL,
  effective_rate_php   REAL,
  status               TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft','confirmed')),
  source               TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','ai_corrected')),
  file_id              TEXT REFERENCES files(id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bills_site ON electricity_bills(site_id);
CREATE INDEX IF NOT EXISTS idx_bills_user ON electricity_bills(user_id);

CREATE TABLE IF NOT EXISTS bill_extractions (
  id         TEXT PRIMARY KEY,
  bill_id    TEXT NOT NULL REFERENCES electricity_bills(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  model      TEXT,
  raw_json   TEXT,
  confidence REAL,
  status     TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','accepted','rejected','failed')),
  error      TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assessments (
  id            TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL,
  inputs_json   TEXT NOT NULL,
  result_json   TEXT NOT NULL,
  explanation   TEXT,
  explanation_source TEXT,
  status        TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('draft','ready','quote_requested','archived')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assessments_user ON assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_assessments_site ON assessments(site_id);

CREATE TABLE IF NOT EXISTS assessment_scenarios (
  id                    TEXT PRIMARY KEY,
  assessment_id         TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL CHECK (name IN ('low','base','high')),
  capacity_kwp          REAL NOT NULL,
  annual_production_kwh REAL NOT NULL,
  annual_savings_php    REAL NOT NULL,
  payback_years         REAL,
  capex_php             REAL NOT NULL,
  net_25y_php           REAL NOT NULL,
  self_consumption_ratio REAL NOT NULL,
  summary_json          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenarios_assessment ON assessment_scenarios(assessment_id);

CREATE TABLE IF NOT EXISTS consents (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('bill_processing','contact_sharing','marketing','terms','privacy')),
  version      TEXT NOT NULL,
  granted_at   TEXT,
  revoked_at   TEXT,
  ip           TEXT,
  context_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id, kind);

CREATE TABLE IF NOT EXISTS quote_requests (
  id                TEXT PRIMARY KEY,
  customer_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id           TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  assessment_id     TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','matched','closed','cancelled')),
  message           TEXT,
  share_contact     INTEGER NOT NULL DEFAULT 0,
  contact_name      TEXT,
  contact_phone     TEXT,
  contact_email     TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quote_requests_customer ON quote_requests(customer_user_id);

CREATE TABLE IF NOT EXISTS quote_invites (
  id               TEXT PRIMARY KEY,
  quote_request_id TEXT NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  installer_id     TEXT NOT NULL REFERENCES installers(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'invited'
                   CHECK (status IN ('invited','viewed','quoted','declined','withdrawn')),
  responded_at     TEXT,
  created_at       TEXT NOT NULL,
  UNIQUE (quote_request_id, installer_id)
);
CREATE INDEX IF NOT EXISTS idx_invites_installer ON quote_invites(installer_id, status);

CREATE TABLE IF NOT EXISTS installer_quotes (
  id                          TEXT PRIMARY KEY,
  invite_id                   TEXT NOT NULL UNIQUE REFERENCES quote_invites(id) ON DELETE CASCADE,
  quote_request_id            TEXT NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  installer_id                TEXT NOT NULL REFERENCES installers(id) ON DELETE CASCADE,
  status                      TEXT NOT NULL DEFAULT 'submitted'
                              CHECK (status IN ('submitted','revised','withdrawn')),
  capacity_kwp                REAL NOT NULL,
  price_php                   REAL NOT NULL,
  warranty_years              INTEGER NOT NULL,
  workmanship_warranty_years  INTEGER NOT NULL,
  timeline_weeks              INTEGER NOT NULL,
  expected_annual_kwh         REAL NOT NULL,
  exclusions                  TEXT,
  notes                       TEXT,
  valid_until                 TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quotes_request ON installer_quotes(quote_request_id);

CREATE TABLE IF NOT EXISTS quote_line_items (
  id             TEXT PRIMARY KEY,
  quote_id       TEXT NOT NULL REFERENCES installer_quotes(id) ON DELETE CASCADE,
  category       TEXT NOT NULL,
  description    TEXT NOT NULL,
  quantity       REAL NOT NULL DEFAULT 1,
  unit           TEXT,
  unit_price_php REAL,
  amount_php     REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_line_items_quote ON quote_line_items(quote_id);

CREATE TABLE IF NOT EXISTS lead_status_events (
  id               TEXT PRIMARY KEY,
  quote_request_id TEXT NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  actor_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role       TEXT NOT NULL,
  from_status      TEXT,
  to_status        TEXT NOT NULL,
  note             TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  href       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id            TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT,
  metadata_json TEXT,
  ip            TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);

CREATE TABLE IF NOT EXISTS installer_documents (
  id          TEXT PRIMARY KEY,
  installer_id TEXT NOT NULL REFERENCES installers(id) ON DELETE CASCADE,
  file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('sec_registration','mayors_permit','license','insurance','other')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_events (
  id           TEXT PRIMARY KEY,
  installer_id TEXT NOT NULL REFERENCES installers(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  notes        TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_requests (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('export','deletion')),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','processing','completed','rejected')),
  note        TEXT,
  created_at  TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
