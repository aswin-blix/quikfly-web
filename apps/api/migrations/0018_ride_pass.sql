-- QuikFly Pass: one row per pass bought (paid from the wallet in the same batch as its
-- wallet_transactions row). A pass bought while another runs starts when that one ends, so a
-- rider's rows never overlap and the latest expires_at is when their pass ends.
CREATE TABLE ride_passes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price      INTEGER NOT NULL,
  days       INTEGER NOT NULL,
  starts_at  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ride_passes_by_user ON ride_passes (user_id, expires_at);
