-- Staff alerts: one row per event staff should look at (an SOS press, a new ticket, a partner
-- application...), addressed to the permission that acts on it (STAFF_ALERT_PERMISSION in
-- @quikfly/shared). Each admin's read marks are its own. Never holds a customer's name or number.
CREATE TABLE staff_alerts (
  id         TEXT PRIMARY KEY,
  permission TEXT NOT NULL,
  kind       TEXT NOT NULL,
  ref        TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  link       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  pushed_at  TEXT,
  UNIQUE (kind, ref)
);
CREATE INDEX staff_alerts_recent ON staff_alerts (created_at);
CREATE INDEX staff_alerts_unpushed ON staff_alerts (pushed_at, created_at);

CREATE TABLE staff_alert_reads (
  alert_id TEXT NOT NULL REFERENCES staff_alerts(id) ON DELETE CASCADE,
  admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  read_at  TEXT NOT NULL,
  PRIMARY KEY (alert_id, admin_id)
);

-- Staff browsers (and phones) that get alerts pushed: token = a browser PushSubscription JSON or an FCM token.
CREATE TABLE admin_push_devices (
  token      TEXT PRIMARY KEY,
  admin_id   TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen  TEXT NOT NULL
);
CREATE INDEX admin_push_devices_admin ON admin_push_devices (admin_id);
