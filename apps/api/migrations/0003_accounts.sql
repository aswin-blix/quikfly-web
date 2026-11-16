-- Accounts: profile, referral, licence, GST, safety preference, soft delete.
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN gender TEXT;
ALTER TABLE users ADD COLUMN dob TEXT;
ALTER TABLE users ADD COLUMN profile_completed_at TEXT;
ALTER TABLE users ADD COLUMN referral_code TEXT;
ALTER TABLE users ADD COLUMN referred_by TEXT;
ALTER TABLE users ADD COLUMN licence_number TEXT;
ALTER TABLE users ADD COLUMN licence_expiry TEXT;
ALTER TABLE users ADD COLUMN licence_submitted_at TEXT;
ALTER TABLE users ADD COLUMN gstin TEXT;
ALTER TABLE users ADD COLUMN gst_name TEXT;
ALTER TABLE users ADD COLUMN auto_share_night INTEGER NOT NULL DEFAULT 0;
-- Set when the user asks to delete the account; signing in within the grace period undoes it.
ALTER TABLE users ADD COLUMN deleted_at TEXT;

-- Existing users already gave their name at login and keep their balance.
UPDATE users SET profile_completed_at = created_at;
UPDATE users SET referral_code = 'QF' || substr(hex(randomblob(4)), 1, 6);
CREATE UNIQUE INDEX users_referral_code ON users (referral_code);

CREATE TABLE saved_places (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  label      TEXT NOT NULL,
  place_id   TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX saved_places_by_user ON saved_places (user_id);

CREATE TABLE travellers (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  age        INTEGER NOT NULL,
  gender     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX travellers_by_user ON travellers (user_id);

CREATE TABLE emergency_contacts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  relation   TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX emergency_contacts_by_user ON emergency_contacts (user_id);

-- Every change to a wallet balance, newest first in the app.
CREATE TABLE wallet_transactions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  note       TEXT NOT NULL,
  booking_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX wallet_transactions_by_user ON wallet_transactions (user_id, created_at DESC);

-- History starts here, so record what each existing user already holds.
INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
  SELECT 'WT' || substr(hex(randomblob(8)), 1, 12), id, 'opening', wallet_balance, 'Opening balance', NULL, created_at
  FROM users WHERE wallet_balance <> 0;

-- Public links that let someone follow a ride.
CREATE TABLE ride_shares (
  token      TEXT PRIMARY KEY,
  ride_id    TEXT NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
