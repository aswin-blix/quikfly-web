-- QuikFly Captain (docs/driver-app-plan.md): drivers sign in, go online and take live rides.
-- Nothing here changes a ride until the featureLiveDrivers setting is on.

-- A driver record becomes a login: the account whose phone matches is linked at the first sign-in to Captain.
ALTER TABLE vendor_drivers ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX vendor_drivers_user_once ON vendor_drivers (user_id) WHERE user_id IS NOT NULL;
-- Set by staff at review (female | male | other); women-only rides go only to women captains.
ALTER TABLE vendor_drivers ADD COLUMN gender TEXT;

-- Where a captain is and whether they take rides. One row per driver, the latest position only (no trail).
-- x, y are on the demo city map (0-100, as places are); lat, lng are kept when the phone sent a real fix.
CREATE TABLE driver_state (
  driver_id    TEXT PRIMARY KEY REFERENCES vendor_drivers(id) ON DELETE CASCADE,
  online       INTEGER NOT NULL DEFAULT 0,
  x            REAL,
  y            REAL,
  lat          REAL,
  lng          REAL,
  demo         INTEGER NOT NULL DEFAULT 0,   -- 1 = a demo location the captain picked, not GPS
  seen_at      TEXT,                         -- last ping; stale captains get no offers and are set offline by the cron
  idle_since   TEXT,                         -- since when they have been waiting (longest wait is asked first)
  ride_id      TEXT REFERENCES rides(id) ON DELETE SET NULL  -- the ride they are on
);
CREATE INDEX driver_state_online ON driver_state (online) WHERE online = 1;

-- Who was asked to take a ride, in order, and what they did (pending | accepted | declined | timeout | withdrawn).
CREATE TABLE ride_offers (
  ride_id     TEXT NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id   TEXT NOT NULL REFERENCES vendor_drivers(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  offered_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  outcome     TEXT NOT NULL DEFAULT 'pending',
  decided_at  TEXT,
  PRIMARY KEY (ride_id, driver_id)
);
CREATE INDEX ride_offers_by_driver ON ride_offers (driver_id, outcome);

-- A live ride's progress is the server's: dispatch sim (as before: the customer's app plays it) | live.
-- phase: searching | arriving | arrived | ontrip | done | unmatched (RIDE_PHASES); NULL for simulated rides.
-- offer_seq guards dispatch: a step only applies to the sequence number it read.
ALTER TABLE rides ADD COLUMN dispatch TEXT NOT NULL DEFAULT 'sim';
ALTER TABLE rides ADD COLUMN phase TEXT;
ALTER TABLE rides ADD COLUMN phase_at TEXT;
ALTER TABLE rides ADD COLUMN offer_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rides ADD COLUMN otp_tries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rides ADD COLUMN otp_locked_until TEXT;
CREATE INDEX rides_searching ON rides (phase) WHERE phase = 'searching';
