-- Catalog and prices move into the database so the admin panel can edit them,
-- and bookings are priced by the API (quotes) instead of trusting the browser.

-- Every catalog kind in one table (kinds and fields: packages/shared/src/catalog-kinds.ts).
-- Filled from the seed on first use by services/catalog.ts, which records that in `meta`.
CREATE TABLE catalog_items (
  kind       TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX catalog_items_by_kind ON catalog_items (kind, active, sort);

-- Small key/value flags for the API itself (e.g. when the catalog was seeded).
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Prices worked out by the API. A booking uses one once, before it expires.
CREATE TABLE quotes (
  id         TEXT PRIMARY KEY,
  service    TEXT NOT NULL,
  request    TEXT NOT NULL,
  lines      TEXT NOT NULL,
  total      INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    TEXT
);

-- Bookings remember which quote or ride priced them, and any coupon.
ALTER TABLE bookings ADD COLUMN quote_id TEXT;
ALTER TABLE bookings ADD COLUMN ride_id TEXT;
ALTER TABLE bookings ADD COLUMN coupon_code TEXT;
ALTER TABLE bookings ADD COLUMN discount INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX bookings_ride_once ON bookings (ride_id) WHERE ride_id IS NOT NULL;
CREATE INDEX bookings_by_coupon ON bookings (user_id, coupon_code) WHERE coupon_code IS NOT NULL;
