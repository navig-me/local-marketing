-- local-marketing SQLite schema
-- Single source of truth. Files (config.yaml, pending_review/, approved/) are
-- the human-approval surface; this DB is what every agent script reads/writes.

CREATE TABLE IF NOT EXISTS segments (
  id              TEXT PRIMARY KEY,        -- e.g. "tuition_centres_1_3_locations"
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'inactive',  -- inactive | active | retired
  brief_path      TEXT NOT NULL,           -- path to segments/<id>.yaml
  weekly_new_prospect_cap INTEGER NOT NULL DEFAULT 25,
  ramp_week       INTEGER NOT NULL DEFAULT 0,         -- 0-3, ramps 5/10/15/25 then full cap
  activated_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prospects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  segment_id      TEXT NOT NULL REFERENCES segments(id),
  business_name   TEXT NOT NULL,
  contact_name    TEXT,
  email           TEXT,
  website         TEXT,
  source          TEXT,                    -- how this candidate was found (human-curated)
  status          TEXT NOT NULL DEFAULT 'candidate',
                  -- candidate | qualified | disqualified | sequenced | replied | closed
  relevance_note  TEXT,                    -- evidence-backed note written by research agent
  relevance_source TEXT,                   -- URL/citation backing the note
  fit_score       REAL,
  disqualify_reason TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sequence_state (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id     INTEGER NOT NULL REFERENCES prospects(id),
  step            INTEGER NOT NULL DEFAULT 0,  -- 0=not started, 1..4 = day 1/4/9/15
  next_send_date  TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
                  -- pending | drafted | approved | sent | stopped | paused
  draft_path      TEXT,                    -- file in pending_review/ or approved/
  stopped_reason  TEXT,                    -- reply | bounce | unsubscribe | manual | breaker
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppression (
  email           TEXT PRIMARY KEY,
  reason          TEXT NOT NULL,           -- unsubscribe | complaint | bounce | manual | customer
  added_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS replies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id     INTEGER NOT NULL REFERENCES prospects(id),
  raw_excerpt     TEXT,
  label           TEXT,                    -- positive | objection | not_now | referral | unsubscribe | bounce
  requires_human  INTEGER NOT NULL DEFAULT 1,
  task_path       TEXT,                    -- file written for human follow-up
  received_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS send_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id     INTEGER NOT NULL REFERENCES prospects(id),
  sequence_step   INTEGER NOT NULL,
  sent_at         TEXT NOT NULL DEFAULT (datetime('now')),
  status          TEXT NOT NULL,           -- sent | bounced | complained | delivered
  provider_message_id TEXT
);

CREATE TABLE IF NOT EXISTS circuit_breaker_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tripped_at      TEXT NOT NULL DEFAULT (datetime('now')),
  reason          TEXT NOT NULL,           -- bounce_rate | complaint_rate
  metric_value    REAL NOT NULL,
  threshold       REAL NOT NULL,
  cleared_at      TEXT,
  cleared_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_prospects_segment_status ON prospects(segment_id, status);
CREATE INDEX IF NOT EXISTS idx_sequence_state_next_send ON sequence_state(next_send_date, status);
CREATE INDEX IF NOT EXISTS idx_send_log_sent_at ON send_log(sent_at);
