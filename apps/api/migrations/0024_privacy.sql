-- Privacy (DPDP Act 2023 + Rules 2025; packages/shared/src/privacy.ts, services/privacy.ts):
--   privacy_version / privacy_consent_at: the notice version the person last agreed to.
--   privacy_consents: every consent given, kept as proof (it survives erasure).
--   last_active_at: last sign-in or app use (touched at most daily), for the inactivity sweep.
--   erased_at: set when an account past its deletion grace period has been anonymised.
ALTER TABLE users ADD COLUMN privacy_version TEXT;
ALTER TABLE users ADD COLUMN privacy_consent_at TEXT;
ALTER TABLE users ADD COLUMN last_active_at TEXT;
ALTER TABLE users ADD COLUMN erased_at TEXT;
UPDATE users SET last_active_at = created_at;

CREATE TABLE privacy_consents (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version  TEXT NOT NULL,
  given_at TEXT NOT NULL,
  PRIMARY KEY (user_id, version)
);

-- The every-minute sweep reads only these partial indexes, so it costs almost nothing.
CREATE INDEX users_live_by_activity ON users (last_active_at) WHERE deleted_at IS NULL;
CREATE INDEX users_closed_by_date ON users (deleted_at) WHERE deleted_at IS NOT NULL AND erased_at IS NULL;
