import type Database from "better-sqlite3";

/**
 * Idempotent, additive migrations applied every time the database is opened.
 * They never drop or rewrite existing user data. Each step checks the current
 * schema first, so running them repeatedly (or on a fresh schema.sql database)
 * is safe. Applied steps are recorded in schema_migrations for auditability.
 */

type Db = Database.Database;

function hasColumn(db: Db, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

function addColumn(db: Db, table: string, column: string, definition: string) {
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export const MIGRATIONS: { id: string; description: string; up: (db: Db) => void; foreignKeysOff?: boolean }[] = [
  {
    id: "2026-11-08-01-site-clarity",
    description:
      "Separate one-time installation budget from the legacy, ambiguous monthly budget; explicit unknown roof area; export preference.",
    up(db) {
      // install_budget_php: one-time installation budget (pesos). The legacy monthly_budget_php column is
      // kept untouched because its meaning was ambiguous; it is no longer used by the engine.
      addColumn(db, "sites", "install_budget_php", "INTEGER");
      addColumn(
        db,
        "sites",
        "roof_area_status",
        "TEXT NOT NULL DEFAULT 'known' CHECK (roof_area_status IN ('known','unknown'))",
      );
      addColumn(
        db,
        "sites",
        "export_preference",
        "TEXT CHECK (export_preference IS NULL OR export_preference IN ('net_metering','zero_export','not_sure'))",
      );
    },
  },
  {
    id: "2026-11-08-02-guest-drafts",
    description: "Server-side guest estimate drafts, claimable only by the holder of the random token.",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS guest_drafts (
        id                 TEXT PRIMARY KEY,
        token_hash         TEXT NOT NULL UNIQUE,
        data_json          TEXT NOT NULL,
        step               INTEGER NOT NULL DEFAULT 1,
        completed          INTEGER NOT NULL DEFAULT 0,
        expires_at         TEXT NOT NULL,
        claimed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        claimed_at         TEXT,
        claimed_assessment_id TEXT,
        created_at         TEXT NOT NULL,
        updated_at         TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_guest_drafts_expires ON guest_drafts(expires_at)");
    },
  },
  {
    id: "2026-11-08-03-quote-equipment",
    description: "Optional equipment and responsibility fields on installer quotes.",
    up(db) {
      addColumn(db, "installer_quotes", "panel_model", "TEXT");
      addColumn(db, "installer_quotes", "inverter_model", "TEXT");
      addColumn(db, "installer_quotes", "equipment_supplier", "TEXT");
      addColumn(db, "installer_quotes", "inclusions", "TEXT");
    },
  },
  {
    id: "2026-11-08-04-ai-cache-usage",
    description: "AI result cache and usage metering (no raw bill content is stored).",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS ai_cache (
        cache_key   TEXT PRIMARY KEY,
        feature     TEXT NOT NULL,
        user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
        entity_id   TEXT,
        locale      TEXT,
        prompt_version TEXT NOT NULL,
        provider    TEXT NOT NULL,
        model       TEXT,
        output_json TEXT NOT NULL,
        source      TEXT NOT NULL CHECK (source IN ('ai','deterministic')),
        created_at  TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_ai_cache_entity ON ai_cache(entity_id, feature)");
      db.exec(`CREATE TABLE IF NOT EXISTS ai_usage (
        id          TEXT PRIMARY KEY,
        user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
        feature     TEXT NOT NULL,
        provider    TEXT NOT NULL,
        model       TEXT,
        status      TEXT NOT NULL,
        attempts    INTEGER NOT NULL DEFAULT 1,
        latency_ms  INTEGER,
        created_at  TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(user_id, feature, created_at)");
    },
  },
  {
    id: "2026-11-09-05-supplier-role",
    description: "Allow the 'supplier' role. Rebuilds users with an updated CHECK, preserving every row and id.",
    foreignKeysOff: true,
    up(db) {
      const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get() as { sql: string } | undefined;
      if (!row || row.sql.includes("'supplier'")) return;
      db.exec(`CREATE TABLE users_new (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name          TEXT NOT NULL,
        phone         TEXT,
        role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','installer','supplier','admin')),
        status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      )`);
      db.exec(`INSERT INTO users_new (id, email, password_hash, name, phone, role, status, created_at, updated_at)
               SELECT id, email, password_hash, name, phone, role, status, created_at, updated_at FROM users`);
      db.exec("DROP TABLE users");
      db.exec("ALTER TABLE users_new RENAME TO users");
    },
  },
  {
    id: "2026-11-09-06-marketplace",
    description: "Suppliers, reviewed equipment catalogue, installer price requests, buyer orders and demo flags.",
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS suppliers (
        id                  TEXT PRIMARY KEY,
        user_id             TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        business_name       TEXT NOT NULL,
        slug                TEXT NOT NULL UNIQUE,
        supplier_type       TEXT NOT NULL DEFAULT 'distributor' CHECK (supplier_type IN ('distributor','manufacturer','retailer')),
        about               TEXT,
        website             TEXT,
        phone               TEXT,
        delivery_areas_json TEXT NOT NULL DEFAULT '[]',
        registration_no     TEXT,
        years_in_business   INTEGER,
        verification_status TEXT NOT NULL DEFAULT 'draft'
                            CHECK (verification_status IN ('draft','pending','verified','rejected','suspended')),
        verified_at         TEXT,
        is_demo             INTEGER NOT NULL DEFAULT 0,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(verification_status)");
      db.exec(`CREATE TABLE IF NOT EXISTS supplier_documents (
        id          TEXT PRIMARY KEY,
        supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL CHECK (kind IN ('business_registration','mayors_permit','distributor_certificate','product_certification','other')),
        status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TEXT,
        notes       TEXT,
        created_at  TEXT NOT NULL
      )`);
      db.exec(`CREATE TABLE IF NOT EXISTS supplier_verification_events (
        id            TEXT PRIMARY KEY,
        supplier_id   TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        action        TEXT NOT NULL,
        notes         TEXT,
        created_at    TEXT NOT NULL
      )`);
      db.exec(`CREATE TABLE IF NOT EXISTS products (
        id                         TEXT PRIMARY KEY,
        supplier_id                TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        category                   TEXT NOT NULL CHECK (category IN ('panel','inverter','battery','mounting','accessory')),
        brand                      TEXT NOT NULL,
        model                      TEXT NOT NULL,
        title                      TEXT NOT NULL,
        description                TEXT,
        specs_json                 TEXT NOT NULL DEFAULT '{}',
        warranty_product_years     INTEGER,
        warranty_performance_years INTEGER,
        warranty_backer            TEXT,
        certifications             TEXT,
        datasheet_file_id          TEXT REFERENCES files(id) ON DELETE SET NULL,
        price_php                  REAL CHECK (price_php IS NULL OR price_php >= 0),
        unit                       TEXT NOT NULL DEFAULT 'piece',
        stock_status               TEXT NOT NULL DEFAULT 'in_stock' CHECK (stock_status IN ('in_stock','made_to_order','out_of_stock')),
        lead_time_days             INTEGER,
        status                     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','approved','rejected','archived')),
        review_notes               TEXT,
        reviewed_by                TEXT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at                TEXT,
        created_at                 TEXT NOT NULL,
        updated_at                 TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_products_status ON products(status, category)");
      db.exec(`CREATE TABLE IF NOT EXISTS price_requests (
        id               TEXT PRIMARY KEY,
        installer_id     TEXT NOT NULL REFERENCES installers(id) ON DELETE CASCADE,
        supplier_id      TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        product_id       TEXT REFERENCES products(id) ON DELETE SET NULL,
        quote_request_id TEXT REFERENCES quote_requests(id) ON DELETE SET NULL,
        quantity         REAL NOT NULL CHECK (quantity > 0),
        message          TEXT,
        status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','quoted','accepted','declined','withdrawn')),
        unit_price_php   REAL,
        total_php        REAL,
        lead_time_days   INTEGER,
        supplier_note    TEXT,
        valid_until      TEXT,
        responded_at     TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_price_requests_installer ON price_requests(installer_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_price_requests_supplier ON price_requests(supplier_id, status)");
      db.exec(`CREATE TABLE IF NOT EXISTS orders (
        id                TEXT PRIMARY KEY,
        customer_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        supplier_id       TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        status            TEXT NOT NULL DEFAULT 'requested'
                          CHECK (status IN ('requested','confirmed','paid','shipped','delivered','cancelled','declined')),
        delivery_city     TEXT NOT NULL,
        delivery_province TEXT,
        delivery_address  TEXT,
        contact_name      TEXT NOT NULL,
        contact_phone     TEXT NOT NULL,
        installer_plan    TEXT NOT NULL CHECK (installer_plan IN ('platform_installer','own_installer','undecided')),
        installer_id      TEXT REFERENCES installers(id) ON DELETE SET NULL,
        note              TEXT,
        subtotal_php      REAL,
        delivery_fee_php  REAL,
        total_php         REAL,
        eta_date          TEXT,
        supplier_note     TEXT,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_user_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_orders_supplier ON orders(supplier_id, status)");
      db.exec(`CREATE TABLE IF NOT EXISTS order_items (
        id              TEXT PRIMARY KEY,
        order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id      TEXT REFERENCES products(id) ON DELETE SET NULL,
        title           TEXT NOT NULL,
        brand           TEXT NOT NULL,
        model           TEXT NOT NULL,
        quantity        REAL NOT NULL CHECK (quantity > 0),
        unit_price_php  REAL,
        line_total_php  REAL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)");
      db.exec(`CREATE TABLE IF NOT EXISTS order_events (
        id            TEXT PRIMARY KEY,
        order_id      TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        actor_role    TEXT NOT NULL,
        from_status   TEXT,
        to_status     TEXT NOT NULL,
        note          TEXT,
        created_at    TEXT NOT NULL
      )`);
      addColumn(db, "installer_quotes", "panel_product_id", "TEXT REFERENCES products(id) ON DELETE SET NULL");
      addColumn(db, "installer_quotes", "inverter_product_id", "TEXT REFERENCES products(id) ON DELETE SET NULL");
      addColumn(db, "installers", "is_demo", "INTEGER NOT NULL DEFAULT 0");
    },
  },
  {
    id: "2026-11-09-07-price-advisor",
    description: "Solar Price Advisor: price basis and inclusions on products, advisor conversations, private quotation reviews, buyer quotation requests to suppliers",
    up: (db) => {
      const productCols = (db.prepare("PRAGMA table_info(products)").all() as { name: string }[]).map((c) => c.name);
      if (!productCols.includes("price_basis")) {
        db.exec("ALTER TABLE products ADD COLUMN price_basis TEXT NOT NULL DEFAULT 'equipment_only' CHECK (price_basis IN ('equipment_only','equipment_delivered','supply_and_install'))");
      }
      if (!productCols.includes("inclusions")) db.exec("ALTER TABLE products ADD COLUMN inclusions TEXT");
      if (!productCols.includes("exclusions")) db.exec("ALTER TABLE products ADD COLUMN exclusions TEXT");
      db.exec(`CREATE TABLE IF NOT EXISTS advisor_threads (
        id           TEXT PRIMARY KEY,
        user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
        guest_key    TEXT,
        context_json TEXT NOT NULL DEFAULT '{}',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_advisor_threads_user ON advisor_threads(user_id, updated_at)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_advisor_threads_guest ON advisor_threads(guest_key, updated_at)");
      db.exec(`CREATE TABLE IF NOT EXISTS advisor_turns (
        id            TEXT PRIMARY KEY,
        thread_id     TEXT NOT NULL REFERENCES advisor_threads(id) ON DELETE CASCADE,
        user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
        guest_key     TEXT,
        question      TEXT NOT NULL,
        intent        TEXT NOT NULL,
        response_json TEXT NOT NULL,
        ai_used       INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_advisor_turns_thread ON advisor_turns(thread_id, created_at)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_advisor_turns_user ON advisor_turns(user_id, created_at)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_advisor_turns_guest ON advisor_turns(guest_key, created_at)");
      db.exec(`CREATE TABLE IF NOT EXISTS quote_reviews (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_id           TEXT REFERENCES files(id) ON DELETE SET NULL,
        status            TEXT NOT NULL CHECK (status IN ('extracted','manual','confirmed')),
        extraction_source TEXT NOT NULL CHECK (extraction_source IN ('ai','manual')),
        extraction_note   TEXT,
        data_json         TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_quote_reviews_user ON quote_reviews(user_id, updated_at)");
      db.exec(`CREATE TABLE IF NOT EXISTS supplier_quote_requests (
        id               TEXT PRIMARY KEY,
        customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        supplier_id      TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        product_id       TEXT REFERENCES products(id) ON DELETE SET NULL,
        product_label    TEXT NOT NULL,
        quantity         INTEGER NOT NULL CHECK (quantity > 0),
        delivery_city    TEXT NOT NULL,
        details          TEXT,
        share_contact    INTEGER NOT NULL DEFAULT 0 CHECK (share_contact IN (0,1)),
        contact_name     TEXT,
        contact_phone    TEXT,
        contact_email    TEXT,
        status           TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','replied','declined','closed')),
        reply_price_php  REAL CHECK (reply_price_php IS NULL OR reply_price_php >= 0),
        reply_note       TEXT,
        reply_valid_until TEXT,
        replied_at       TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_sqr_customer ON supplier_quote_requests(customer_user_id, created_at)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_sqr_supplier ON supplier_quote_requests(supplier_id, status)");
    },
  },
  {
    id: "2026-11-10-08-site-surveys",
    description: "Ocular / site surveys: surveys, revisions, evidence (private media), visit timeline and client acknowledgments",
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS site_surveys (
        id                 TEXT PRIMARY KEY,
        reference          TEXT NOT NULL UNIQUE,
        type               TEXT NOT NULL CHECK (type IN ('residential','commercial')),
        template_version   TEXT NOT NULL,
        installer_id       TEXT NOT NULL REFERENCES installers(id) ON DELETE CASCADE,
        created_by         TEXT NOT NULL REFERENCES users(id),
        customer_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
        site_id            TEXT REFERENCES sites(id) ON DELETE SET NULL,
        quote_request_id   TEXT REFERENCES quote_requests(id) ON DELETE SET NULL,
        status             TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','in_progress','submitted','under_review','approved','changes_requested')),
        revision           INTEGER NOT NULL DEFAULT 1,
        version            INTEGER NOT NULL DEFAULT 1,
        data_json          TEXT NOT NULL,
        client_name        TEXT NOT NULL DEFAULT '',
        site_label         TEXT NOT NULL DEFAULT '',
        surveyor_name      TEXT NOT NULL DEFAULT '',
        scheduled_date     TEXT,
        checked_in_at      TEXT,
        check_in_json      TEXT,
        checked_out_at     TEXT,
        check_out_json     TEXT,
        location_status    TEXT NOT NULL DEFAULT 'not_recorded',
        exception_reason   TEXT,
        exception_approved_by TEXT REFERENCES users(id),
        exception_approved_at TEXT,
        shared_with_customer INTEGER NOT NULL DEFAULT 0 CHECK (shared_with_customer IN (0,1)),
        submitted_at       TEXT,
        reviewed_by        TEXT REFERENCES users(id),
        reviewed_at        TEXT,
        review_note        TEXT,
        ai_json            TEXT,
        is_demo            INTEGER NOT NULL DEFAULT 0,
        updated_by         TEXT REFERENCES users(id),
        created_at         TEXT NOT NULL,
        updated_at         TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_surveys_installer ON site_surveys(installer_id, status, updated_at)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_surveys_status ON site_surveys(status, updated_at)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_surveys_customer ON site_surveys(customer_user_id)");
      db.exec(`CREATE TABLE IF NOT EXISTS survey_revisions (
        id           TEXT PRIMARY KEY,
        survey_id    TEXT NOT NULL REFERENCES site_surveys(id) ON DELETE CASCADE,
        revision     INTEGER NOT NULL,
        status       TEXT NOT NULL,
        data_json    TEXT NOT NULL,
        evidence_ids_json TEXT NOT NULL DEFAULT '[]',
        changed_fields_json TEXT NOT NULL DEFAULT '[]',
        reason       TEXT,
        created_by   TEXT REFERENCES users(id),
        created_at   TEXT NOT NULL,
        UNIQUE (survey_id, revision, status)
      )`);
      db.exec(`CREATE TABLE IF NOT EXISTS survey_evidence (
        id                 TEXT PRIMARY KEY,
        survey_id          TEXT NOT NULL REFERENCES site_surveys(id) ON DELETE CASCADE,
        uploader_user_id   TEXT NOT NULL REFERENCES users(id),
        client_key         TEXT NOT NULL,
        kind               TEXT NOT NULL CHECK (kind IN ('photo','video','document','signature')),
        category           TEXT NOT NULL,
        caption            TEXT NOT NULL DEFAULT '',
        item_id            TEXT,
        plane_id           TEXT,
        mime_type          TEXT NOT NULL,
        size_bytes         INTEGER NOT NULL,
        sha256             TEXT NOT NULL,
        storage_key        TEXT NOT NULL UNIQUE,
        original_name      TEXT NOT NULL,
        thumb_storage_key  TEXT,
        thumb_source       TEXT CHECK (thumb_source IN ('server','device')),
        width              INTEGER,
        height             INTEGER,
        duration_sec       REAL,
        duration_source    TEXT CHECK (duration_source IN ('server','device')),
        capture_source     TEXT NOT NULL DEFAULT 'unknown' CHECK (capture_source IN ('in_app_camera','file_upload','unknown')),
        captured_at        TEXT,
        captured_at_source TEXT CHECK (captured_at_source IN ('exif','device_file','device_clock')),
        device_lat         REAL,
        device_lng         REAL,
        device_accuracy_m  REAL,
        location_source    TEXT NOT NULL DEFAULT 'none' CHECK (location_source IN ('device_gps','exif','none')),
        uploaded_at        TEXT NOT NULL,
        status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
        removed_at         TEXT,
        removed_by         TEXT REFERENCES users(id),
        review_status      TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','accepted','rejected')),
        review_note        TEXT,
        reviewed_by        TEXT REFERENCES users(id),
        reviewed_at        TEXT,
        UNIQUE (survey_id, client_key)
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_evidence_survey ON survey_evidence(survey_id, status, category)");
      db.exec(`CREATE TABLE IF NOT EXISTS survey_events (
        id            TEXT PRIMARY KEY,
        survey_id     TEXT NOT NULL REFERENCES site_surveys(id) ON DELETE CASCADE,
        actor_user_id TEXT REFERENCES users(id),
        type          TEXT NOT NULL,
        message       TEXT,
        payload_json  TEXT,
        created_at    TEXT NOT NULL
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_survey_events ON survey_events(survey_id, created_at)");
      db.exec(`CREATE TABLE IF NOT EXISTS survey_acknowledgments (
        id                    TEXT PRIMARY KEY,
        survey_id             TEXT NOT NULL REFERENCES site_surveys(id) ON DELETE CASCADE,
        client_name           TEXT NOT NULL,
        consent_text          TEXT NOT NULL,
        consent_version       TEXT NOT NULL,
        signature_evidence_id TEXT REFERENCES survey_evidence(id),
        device_time           TEXT,
        recorded_by           TEXT NOT NULL REFERENCES users(id),
        acknowledged_at       TEXT NOT NULL
      )`);
      db.exec(`CREATE TABLE IF NOT EXISTS survey_sequences (year INTEGER PRIMARY KEY, last INTEGER NOT NULL)`);
    },
  },
];

export function runMigrations(db: Db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]).map((row) => row.id),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)").run(
        migration.id,
        migration.description,
        new Date().toISOString(),
      );
    });
    if (migration.foreignKeysOff) {
      // Table rebuilds must run with foreign keys off (SQLite's documented procedure),
      // then every reference is verified before foreign keys are switched back on.
      const wasOn = (db.pragma("foreign_keys", { simple: true }) as number) === 1;
      db.pragma("foreign_keys = OFF");
      try {
        apply();
        const problems = db.pragma("foreign_key_check") as unknown[];
        if (problems.length > 0) throw new Error(`Migration ${migration.id} left ${problems.length} broken references.`);
      } finally {
        if (wasOn) db.pragma("foreign_keys = ON");
      }
    } else {
      apply();
    }
  }
}
