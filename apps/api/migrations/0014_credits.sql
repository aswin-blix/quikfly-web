-- QuikFly Credits: promotional money earned back on completed trips, kept apart from the
-- wallet (real money). Every change is a row: credits in ('earned', 'returned') carry an
-- expiry and how much of them is left; spending takes the soonest-expiring first and adds
-- a 'spent' row; the every-minute cron turns what's left after expiry into an 'expired' row.
CREATE TABLE credits (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  remaining  INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  booking_id TEXT,
  note       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX credits_by_user ON credits (user_id, created_at DESC);
CREATE INDEX credits_live_by_user ON credits (user_id, expires_at) WHERE remaining > 0;
CREATE INDEX credits_live ON credits (expires_at) WHERE remaining > 0;
-- A booking earns credits once, however often completion is retried.
CREATE UNIQUE INDEX credits_earned_once ON credits (booking_id) WHERE kind = 'earned';

-- What a booking paid with credits (on top of `amount`, which is what was paid otherwise).
ALTER TABLE bookings ADD COLUMN credits_used INTEGER NOT NULL DEFAULT 0;
