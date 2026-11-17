-- Admin panel: staff accounts, sessions, audit log, and a stored licence review status.

CREATE TABLE admin_users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL,
  -- "pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>"
  password_hash   TEXT NOT NULL,
  failed_logins   INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id   TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX admin_sessions_by_admin ON admin_sessions (admin_id);

-- Every change an admin makes. admin_id is NULL for scripts (e.g. create-admin).
CREATE TABLE audit_log (
  id         TEXT PRIMARY KEY,
  admin_id   TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  detail     TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX audit_log_by_time ON audit_log (created_at DESC);
CREATE INDEX audit_log_by_entity ON audit_log (entity, entity_id);

CREATE INDEX bookings_by_time ON bookings (created_at DESC);

-- Licence review is now stored: none | pending | verified | rejected.
ALTER TABLE users ADD COLUMN licence_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN licence_note TEXT;
ALTER TABLE users ADD COLUMN licence_reviewed_at TEXT;

-- Licences submitted before this migration were all past the old 20-second simulated review.
UPDATE users SET licence_status = 'verified', licence_reviewed_at = licence_submitted_at
  WHERE licence_number IS NOT NULL AND licence_submitted_at IS NOT NULL;

-- Business settings an owner can change from the admin panel (JSON values; defaults live in @quikfly/shared).
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
