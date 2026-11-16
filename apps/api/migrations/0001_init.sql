-- Users sign in with a phone number; there are no passwords.
CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  phone          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  wallet_balance INTEGER NOT NULL,
  created_at     TEXT NOT NULL
);

-- Login sessions. Only a SHA-256 hash of the bearer token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- Bike/car rides. `data` holds the full Ride JSON returned to the client.
CREATE TABLE rides (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Bookings for every service (rides, bus, tours, rentals).
CREATE TABLE bookings (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service    TEXT NOT NULL,
  title      TEXT NOT NULL,
  subtitle   TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  status     TEXT NOT NULL,
  lines      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX bookings_by_user ON bookings (user_id, created_at DESC);
