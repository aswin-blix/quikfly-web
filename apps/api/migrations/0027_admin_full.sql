-- Phase 6 (admin, full): customer suspension, disabled staff accounts, booking notes and SOS alerts.

-- Customers staff have suspended can't sign in or use a session until staff lift it.
ALTER TABLE users ADD COLUMN suspended_at TEXT;
ALTER TABLE users ADD COLUMN suspend_reason TEXT;

-- Staff accounts the owner has disabled (sessions are ended; sign-in refused).
ALTER TABLE admin_users ADD COLUMN disabled_at TEXT;

-- Internal notes staff attach to a booking (shown only in the admin panel).
CREATE TABLE booking_notes (
  id         TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  admin_id   TEXT NOT NULL REFERENCES admin_users(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX booking_notes_by_booking ON booking_notes (booking_id, created_at);

-- SOS presses from the safety sheet: a record for staff to act on (no dispatch or telephony yet).
CREATE TABLE sos_alerts (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  ride_id      TEXT,
  booking_id   TEXT,
  lat          REAL,
  lng          REAL,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'open',   -- open | acknowledged | closed
  handled_by   TEXT,                           -- admin id
  handled_at   TEXT,
  handled_note TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX sos_alerts_by_status ON sos_alerts (status, created_at DESC);
CREATE INDEX sos_alerts_by_user ON sos_alerts (user_id);
