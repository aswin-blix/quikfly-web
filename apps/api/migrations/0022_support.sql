-- Customer support: callback requests (anyone) and tickets (signed-in customers), answered by
-- staff from one admin queue. Each ticket is a thread of messages.
CREATE TABLE support_tickets (
  id             TEXT PRIMARY KEY,
  user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL,              -- callback | ticket
  status         TEXT NOT NULL DEFAULT 'open', -- open | answered | closed
  topic          TEXT NOT NULL,
  booking_id     TEXT,
  ref            TEXT,
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  preferred_time TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX support_by_status ON support_tickets (status, updated_at);
CREATE INDEX support_by_user ON support_tickets (user_id, updated_at DESC);
CREATE INDEX support_by_phone ON support_tickets (phone, created_at);

CREATE TABLE support_messages (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author     TEXT NOT NULL,                  -- customer | staff
  admin_id   TEXT,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX support_messages_by_ticket ON support_messages (ticket_id, created_at);
