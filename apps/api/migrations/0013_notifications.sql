-- Notifications: an inbox per customer (booking confirmed, refunds, licence decisions,
-- scheduled-ride reminders). One row per event: (user, kind, ref) is unique so a retry or
-- a cron run never notifies twice. pushed_at is set once the push went out (or was skipped).
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  ref        TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  booking_id TEXT,
  created_at TEXT NOT NULL,
  read_at    TEXT,
  pushed_at  TEXT,
  UNIQUE (user_id, kind, ref)
);
CREATE INDEX notifications_user ON notifications (user_id, created_at);
CREATE INDEX notifications_unpushed ON notifications (pushed_at, created_at);

-- Phones that can receive push notifications (Firebase Cloud Messaging tokens).
CREATE TABLE push_devices (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  platform   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen  TEXT NOT NULL
);
CREATE INDEX push_devices_user ON push_devices (user_id);
