-- =============================================================================
-- LearnPhish Database Schema
-- PostgreSQL 14+
-- =============================================================================
-- Tables
--   1. brands              — brand names for impersonation detection
--   2. brand_domains       — official domains owned by each brand
--   3. domain_whitelist    — domains always treated as safe (skip ML + heuristic)
--   4. domain_blacklist    — domains always treated as phishing (block immediately)
--   5. false_positives     — user feedback loop
--   6. scan_log            — audit trail of every URL scanned
--
-- Run:  psql -U postgres -d LearnPhish -f schema.sql
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- trigram similarity (fuzzy search)
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive text type

-- =============================================================================
-- 1. brands
-- =============================================================================
CREATE TABLE IF NOT EXISTS brands (
    id           SERIAL       PRIMARY KEY,
    name         CITEXT       NOT NULL,          -- lowercase brand slug, e.g. 'paypal'
    display_name TEXT         NOT NULL,          -- human label, e.g. 'PayPal'
    category     TEXT         NOT NULL DEFAULT 'other',
                                                 -- finance|tech|ecommerce|telco|gov|crypto|email
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT brands_name_unique UNIQUE (name),
    CONSTRAINT brands_name_format CHECK (name ~ '^[a-z0-9][a-z0-9\-]*[a-z0-9]$' OR length(name) = 1)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brands_name        ON brands (name);
CREATE INDEX IF NOT EXISTS idx_brands_category    ON brands (category);
CREATE INDEX IF NOT EXISTS idx_brands_is_active   ON brands (is_active);
-- Trigram index for fast fuzzy similarity queries
CREATE INDEX IF NOT EXISTS idx_brands_name_trgm   ON brands USING GIN (name gin_trgm_ops);
-- Partial index — active brands only (most queries filter on this)
CREATE INDEX IF NOT EXISTS idx_brands_active_name ON brands (name) WHERE is_active = TRUE;

COMMENT ON TABLE  brands              IS 'Known brands targeted by phishing campaigns.';
COMMENT ON COLUMN brands.name         IS 'Lowercase slug used for fuzzy matching, e.g. ''paypal''.';
COMMENT ON COLUMN brands.display_name IS 'Human-readable brand label, e.g. ''PayPal''.';
COMMENT ON COLUMN brands.category     IS 'One of: finance, tech, ecommerce, telco, gov, crypto, email, other.';


-- =============================================================================
-- 2. brand_domains
-- =============================================================================
CREATE TABLE IF NOT EXISTS brand_domains (
    id           SERIAL       PRIMARY KEY,
    brand_id     INTEGER      NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    domain       CITEXT       NOT NULL,          -- e.g. 'paypal.com'
    is_primary   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT brand_domains_domain_unique UNIQUE (domain)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brand_domains_domain    ON brand_domains (domain);
CREATE INDEX IF NOT EXISTS idx_brand_domains_brand_id  ON brand_domains (brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_domains_primary   ON brand_domains (brand_id) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_brand_domains_trgm      ON brand_domains USING GIN (domain gin_trgm_ops);

COMMENT ON TABLE  brand_domains            IS 'Official domains belonging to each brand (used for exact-match whitelist).';
COMMENT ON COLUMN brand_domains.is_primary IS 'TRUE for the main brand domain (e.g. paypal.com vs paypal.net).';


-- =============================================================================
-- 3. domain_whitelist
-- =============================================================================
CREATE TABLE IF NOT EXISTS domain_whitelist (
    id           SERIAL       PRIMARY KEY,
    domain       CITEXT       NOT NULL,          -- exact match, e.g. 'example.com'
    added_by     TEXT         NOT NULL DEFAULT 'system',
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT whitelist_domain_unique UNIQUE (domain)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whitelist_domain      ON domain_whitelist (domain);
CREATE INDEX IF NOT EXISTS idx_whitelist_is_active   ON domain_whitelist (is_active);
-- Partial index for the hot path: active entries
CREATE INDEX IF NOT EXISTS idx_whitelist_active      ON domain_whitelist (domain)
    WHERE is_active = TRUE;

COMMENT ON TABLE  domain_whitelist           IS 'Domains that bypass all heuristic and ML checks.';
COMMENT ON COLUMN domain_whitelist.domain    IS 'Exact hostname match (case-insensitive). No wildcards.';


-- =============================================================================
-- 4. domain_blacklist
-- =============================================================================
CREATE TABLE IF NOT EXISTS domain_blacklist (
    id              SERIAL       PRIMARY KEY,
    domain          CITEXT       NOT NULL,        -- exact match
    confidence      NUMERIC(4,3) NOT NULL DEFAULT 1.000
                    CHECK (confidence BETWEEN 0 AND 1),
    source          TEXT         NOT NULL DEFAULT 'manual',
                                                  -- manual|feed|ml_confirmed|user_report
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    first_seen_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT blacklist_domain_unique UNIQUE (domain),
    CONSTRAINT blacklist_confidence_range CHECK (confidence BETWEEN 0 AND 1)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blacklist_domain           ON domain_blacklist (domain);
CREATE INDEX IF NOT EXISTS idx_blacklist_is_active        ON domain_blacklist (is_active);
CREATE INDEX IF NOT EXISTS idx_blacklist_source           ON domain_blacklist (source);
CREATE INDEX IF NOT EXISTS idx_blacklist_confidence       ON domain_blacklist (confidence DESC);
CREATE INDEX IF NOT EXISTS idx_blacklist_last_confirmed   ON domain_blacklist (last_confirmed_at DESC);
-- Trigram for partial/fuzzy searches in admin tools
CREATE INDEX IF NOT EXISTS idx_blacklist_domain_trgm      ON domain_blacklist USING GIN (domain gin_trgm_ops);
-- Hot-path partial index
CREATE INDEX IF NOT EXISTS idx_blacklist_active           ON domain_blacklist (domain)
    WHERE is_active = TRUE;

COMMENT ON TABLE  domain_blacklist               IS 'Domains permanently or temporarily blocked as threats.';
COMMENT ON COLUMN domain_blacklist.confidence    IS '0-1 confidence this is malicious (1.0 = manually confirmed).';
COMMENT ON COLUMN domain_blacklist.source        IS 'Where the entry originated: manual | feed | ml_confirmed | user_report.';


-- =============================================================================
-- 5. false_positives  (user feedback loop)
-- =============================================================================
CREATE TABLE IF NOT EXISTS false_positives (
    id               SERIAL       PRIMARY KEY,
    url              TEXT         NOT NULL,
    domain           CITEXT       NOT NULL,
    triggered_rule   TEXT,                       -- e.g. 'homograph', 'typosquatting'
    similarity_score NUMERIC(5,4),
    matched_brand    TEXT,
    user_feedback    TEXT         NOT NULL        -- 'false_positive' | 'true_positive'
                     CHECK (user_feedback IN ('false_positive', 'true_positive')),
    notes            TEXT,                        -- optional user comment
    resolved         BOOLEAN      NOT NULL DEFAULT FALSE,
    resolved_by      TEXT,
    resolved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE false_positives IS 'User-reported misclassifications for continuous model improvement.';


-- =============================================================================
-- 6. scan_log  (audit trail)
-- =============================================================================
CREATE TABLE IF NOT EXISTS scan_log (
    id                  BIGSERIAL    PRIMARY KEY,
    url                 TEXT         NOT NULL,
    domain              CITEXT       NOT NULL,
    -- Pipeline decisions
    whitelist_hit       BOOLEAN      NOT NULL DEFAULT FALSE,
    blacklist_hit       BOOLEAN      NOT NULL DEFAULT FALSE,
    heuristic_verdict   TEXT,                    -- pass|suspicious|block
    heuristic_flags     JSONB,                   -- array of flag objects
    brand_verdict       TEXT,                    -- pass|suspicious|block
    brand_matched       TEXT,
    ml_skipped          BOOLEAN      NOT NULL DEFAULT FALSE,
    -- ML output
    ml_prediction       TEXT,                    -- phishing|legitimate
    ml_confidence       NUMERIC(5,4),
    ml_risk_score       NUMERIC(5,1),
    -- Final verdict
    final_verdict       TEXT         NOT NULL,   -- phishing|legitimate
    final_confidence    NUMERIC(5,4),
    -- Request meta
    response_ms         INTEGER,                 -- total response time
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE scan_log IS 'Full audit log of every URL scan. Append-only.';


-- =============================================================================
-- Auto-update updated_at trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_brands_updated_at
      BEFORE UPDATE ON brands
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_whitelist_updated_at
      BEFORE UPDATE ON domain_whitelist
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_blacklist_updated_at
      BEFORE UPDATE ON domain_blacklist
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- Convenience views
-- =============================================================================

-- Active whitelist
CREATE OR REPLACE VIEW v_active_whitelist AS
SELECT id, domain, added_by, created_at
FROM domain_whitelist
WHERE is_active = TRUE;

-- Active blacklist
CREATE OR REPLACE VIEW v_active_blacklist AS
SELECT id, domain, confidence, source,
       first_seen_at, last_confirmed_at
FROM domain_blacklist
WHERE is_active = TRUE;

-- All official brand domains (flat lookup)
CREATE OR REPLACE VIEW v_brand_official_domains AS
SELECT bd.domain, b.name AS brand_name, b.display_name, b.category, bd.is_primary
FROM brand_domains bd
JOIN brands b ON b.id = bd.brand_id
WHERE b.is_active = TRUE;

-- Unresolved false positive reports
CREATE OR REPLACE VIEW v_open_false_positives AS
SELECT id, domain, triggered_rule, matched_brand, similarity_score,
       user_feedback, notes, created_at
FROM false_positives
WHERE resolved = FALSE
ORDER BY created_at DESC;

-- Daily scan summary
CREATE OR REPLACE VIEW v_scan_summary_daily AS
SELECT
    DATE(created_at)         AS scan_date,
    COUNT(*)                 AS total_scans,
    SUM(CASE WHEN final_verdict = 'phishing'   THEN 1 ELSE 0 END) AS phishing_count,
    SUM(CASE WHEN final_verdict = 'legitimate' THEN 1 ELSE 0 END) AS legitimate_count,
    SUM(CASE WHEN whitelist_hit  THEN 1 ELSE 0 END)               AS whitelist_hits,
    SUM(CASE WHEN blacklist_hit  THEN 1 ELSE 0 END)               AS blacklist_hits,
    SUM(CASE WHEN ml_skipped     THEN 1 ELSE 0 END)               AS ml_skipped_count,
    ROUND(AVG(response_ms))                                        AS avg_response_ms
FROM scan_log
GROUP BY DATE(created_at)
ORDER BY scan_date DESC;


-- =============================================================================
-- 7. threat_domains  (quiz category lookup table)
-- =============================================================================
CREATE TABLE IF NOT EXISTS threat_domains (
    id          SERIAL      PRIMARY KEY,
    name        TEXT        NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT threat_domains_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_threat_domains_name ON threat_domains (name);

COMMENT ON TABLE  threat_domains             IS 'Quiz categories — maps 1:1 to the 6 Explainer Threat Domains plus the pre_scan hook.';
COMMENT ON COLUMN threat_domains.name        IS 'Exact string used by the frontend domain label, e.g. "Obfuscation & Cloaking".';
COMMENT ON COLUMN threat_domains.description IS 'Short description shown to admins; not sent to frontend.';


-- =============================================================================
-- 8. quiz_questions
-- =============================================================================
CREATE TABLE IF NOT EXISTS quiz_questions (
    id               SERIAL       PRIMARY KEY,
    domain_id        INTEGER      NOT NULL REFERENCES threat_domains(id) ON DELETE CASCADE,
    question_text    TEXT         NOT NULL,
    options          JSONB        NOT NULL,   -- ["Option A", "Option B", "Option C"]
    correct_index    SMALLINT     NOT NULL,   -- 0-based index into options array
    explanation_text TEXT         NOT NULL,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Telemetry counters (atomic SQL increments — never read-modify-write in Python)
    times_fetched    INTEGER      NOT NULL DEFAULT 0,
    times_correct    INTEGER      NOT NULL DEFAULT 0,
    times_incorrect  INTEGER      NOT NULL DEFAULT 0,

    CONSTRAINT quiz_correct_index_range CHECK (correct_index >= 0)
);

-- Fast random-pick by domain (the most common query)
CREATE INDEX IF NOT EXISTS idx_quiz_domain_id    ON quiz_questions (domain_id);
-- Filter out inactive questions
CREATE INDEX IF NOT EXISTS idx_quiz_is_active    ON quiz_questions (is_active);
-- Partial index for the hot path: only active questions
CREATE INDEX IF NOT EXISTS idx_quiz_active_domain ON quiz_questions (domain_id)
    WHERE is_active = TRUE;

COMMENT ON TABLE  quiz_questions                  IS 'Quiz questions. Correct answers are never exposed to the frontend directly.';
COMMENT ON COLUMN quiz_questions.options          IS 'JSONB array of answer strings shown to the user.';
COMMENT ON COLUMN quiz_questions.correct_index    IS '0-based index of the correct answer in the options array.';
COMMENT ON COLUMN quiz_questions.explanation_text IS 'Revealed to the user only after they submit an answer.';
COMMENT ON COLUMN quiz_questions.times_fetched    IS 'Incremented atomically each time this question is sent to a browser.';
COMMENT ON COLUMN quiz_questions.times_correct    IS 'Incremented atomically on a correct answer submission.';
COMMENT ON COLUMN quiz_questions.times_incorrect  IS 'Incremented atomically on an incorrect answer submission.';


-- =============================================================================
-- 9. ml_feature_logs  (public dataset — one row per scanned URL)
-- =============================================================================
-- Each ML feature extracted by scripts/feature_extractor.py gets its own
-- column so the table can be exported directly as a clean CSV for model training
-- without any JSON parsing or post-processing.
--
-- label:         1 = phishing   0 = legitimate
-- model_version: tag of the model that produced the verdict, e.g. 'rf_v1'
-- url_redacted:  original URL with query VALUES replaced by REDACTED to
--               prevent exposing user credentials in the public dataset.
-- =============================================================================
CREATE TABLE IF NOT EXISTS ml_feature_logs (
    id              BIGSERIAL    PRIMARY KEY,
    url_redacted    TEXT         NOT NULL,
    label           SMALLINT     NOT NULL CHECK (label IN (0, 1)),
    model_version   TEXT         NOT NULL DEFAULT 'rf_v1',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- ── URL-based ──────────────────────────────────────────────
    url_length                     INTEGER,
    hostname_length                INTEGER,
    has_ip_address                 SMALLINT,        -- 0 or 1
    count_dots                     INTEGER,
    count_hyphens                  INTEGER,
    count_at                       INTEGER,
    count_exclamation              INTEGER,
    count_ampersand                INTEGER,
    count_pipe                     INTEGER,
    count_equal                    INTEGER,
    count_underscore               INTEGER,
    count_percent                  INTEGER,
    count_slash                    INTEGER,
    count_asterisk                 INTEGER,
    count_colon                    INTEGER,
    count_space                    INTEGER,

    -- ── Word & token ───────────────────────────────────────────
    has_www                        SMALLINT,
    has_com                        SMALLINT,
    count_double_slash             INTEGER,
    uses_https                     SMALLINT,

    -- ── Ratio ──────────────────────────────────────────────────
    ratio_digits_path              NUMERIC(10,6),
    ratio_digits_hostname          NUMERIC(10,6),

    -- ── Domain ─────────────────────────────────────────────────
    is_punycode                    SMALLINT,
    tld_in_path                    SMALLINT,
    has_abnormal_subdomain         SMALLINT,
    subdomain_count                INTEGER,
    has_prefix_suffix              SMALLINT,
    is_shortening_service          SMALLINT,

    -- ── Path ───────────────────────────────────────────────────
    path_extension_category        INTEGER,         -- 0=none 1=benign 2=suspicious
    has_multiple_extensions        SMALLINT,
    path_depth                     INTEGER,
    phish_hints                    INTEGER,         -- count of phish keywords in path

    -- ── Query ──────────────────────────────────────────────────
    has_query                      SMALLINT,
    query_param_count              INTEGER,
    has_sensitive_query_keys       SMALLINT,
    query_has_url_value            SMALLINT,
    query_value_max_length         INTEGER,
    query_has_file_extension       SMALLINT,
    query_has_double_file_extension SMALLINT,
    query_entropy                  NUMERIC(10,6),

    -- ── Word length ────────────────────────────────────────────
    has_char_repeat                SMALLINT,
    max_word_length_url            INTEGER,
    max_word_length_hostname       INTEGER,
    max_word_length_path           INTEGER,

    -- ── Brand & impersonation ──────────────────────────────────
    brand_in_domain                SMALLINT,
    brand_in_subdomain             SMALLINT,
    brand_in_path                  SMALLINT,
    brand_mismatch                 SMALLINT,
    brand_impersonation_score      NUMERIC(10,6),

    -- ── TLD ────────────────────────────────────────────────────
    is_suspicious_tld              SMALLINT,
    tld_length                     INTEGER,

    -- ── Entropy ────────────────────────────────────────────────
    entropy_url                    NUMERIC(10,6),
    entropy_domain                 NUMERIC(10,6),
    entropy_path                   NUMERIC(10,6),
    entropy_query                  NUMERIC(10,6),

    -- ── Keyword flags ──────────────────────────────────────────
    has_login_keyword              SMALLINT,
    has_secure_keyword             SMALLINT,
    has_account_keyword            SMALLINT,
    has_update_keyword             SMALLINT,
    has_verify_keyword             SMALLINT,
    has_redirection_keyword        SMALLINT,

    -- ── SLD linguistic features ────────────────────────────────
    vowel_ratio_sld                NUMERIC(10,6),
    consecutive_consonants_max_sld INTEGER,
    has_digit_sld                  SMALLINT,

    -- ── Special character density ──────────────────────────────
    ratio_special_chars_url        NUMERIC(10,6),

    -- ── Domain contains "https" ────────────────────────────────
    domain_has_https               SMALLINT
);

COMMENT ON TABLE  ml_feature_logs               IS 'Public ML training dataset. One row per scanned URL. Append-only.';
COMMENT ON COLUMN ml_feature_logs.label         IS '1 = phishing, 0 = legitimate (based on final_verdict).';
COMMENT ON COLUMN ml_feature_logs.url_redacted  IS 'Original URL with all query parameter VALUES replaced by REDACTED.';
COMMENT ON COLUMN ml_feature_logs.model_version IS 'Tag of the model/pipeline that produced the verdict, e.g. rf_v1.';

