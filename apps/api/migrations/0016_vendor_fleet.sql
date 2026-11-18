-- Partner fleets: more vehicles after joining, drivers, and document expiry.
-- vendor_vehicles.status now also takes draft | submitted | approved | inactive | rejected
-- (see VEHICLE_STATUSES); the first vehicle stays "pending" until the application goes live.
ALTER TABLE vendor_vehicles ADD COLUMN review_note TEXT;
ALTER TABLE vendor_vehicles ADD COLUMN blocked_reason TEXT;
-- 1 = a renewed RC or insurance is waiting for staff to check it.
ALTER TABLE vendor_vehicles ADD COLUMN docs_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vendor_vehicles ADD COLUMN submitted_at TEXT;
CREATE INDEX vendor_vehicles_by_status ON vendor_vehicles (status);

CREATE TABLE vendor_drivers (
  id                 TEXT PRIMARY KEY,
  vendor_id          TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  phone              TEXT NOT NULL,
  dl_number          TEXT NOT NULL UNIQUE,
  dl_valid_till      TEXT NOT NULL,
  dl_key             TEXT,
  self               INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'submitted',
  police_verified_at TEXT,
  training_done_at   TEXT,
  review_note        TEXT,
  blocked_reason     TEXT,
  docs_pending       INTEGER NOT NULL DEFAULT 0,
  vehicle_id         TEXT REFERENCES vendor_vehicles(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX vendor_drivers_by_vendor ON vendor_drivers (vendor_id);
-- One driver per vehicle at a time.
CREATE UNIQUE INDEX vendor_drivers_vehicle_once ON vendor_drivers (vehicle_id) WHERE vehicle_id IS NOT NULL;
