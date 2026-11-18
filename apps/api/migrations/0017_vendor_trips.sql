-- Partner trips and money. Rides (and staff-assigned group trips) can run on a partner's
-- vehicle; when the trip completes, its earnings go to vendor_trips and vendor_ledger in the
-- same batch. Amounts here are in paise (commission and 0.1% TDS need them).
ALTER TABLE rides ADD COLUMN vendor_vehicle_id TEXT;
ALTER TABLE rides ADD COLUMN vendor_driver_id TEXT;
ALTER TABLE bookings ADD COLUMN vendor_id TEXT;
ALTER TABLE bookings ADD COLUMN vendor_vehicle_id TEXT;
ALTER TABLE bookings ADD COLUMN vendor_driver_id TEXT;
CREATE INDEX bookings_by_vendor ON bookings (vendor_id, created_at);
CREATE INDEX bookings_by_vendor_vehicle ON bookings (vendor_vehicle_id, created_at);

-- One row per completed partner trip, with the split as it was on completion.
CREATE TABLE vendor_trips (
  booking_id       TEXT PRIMARY KEY,
  vendor_id        TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  vehicle_id       TEXT,
  driver_id        TEXT,
  service          TEXT NOT NULL,
  payment          TEXT NOT NULL,
  gross_paise      INTEGER NOT NULL,
  discount_paise   INTEGER NOT NULL,
  gst_paise        INTEGER NOT NULL,
  fare_paise       INTEGER NOT NULL,
  commission_paise INTEGER NOT NULL,
  tds_paise        INTEGER NOT NULL,
  earning_paise    INTEGER NOT NULL,
  completed_at     TEXT NOT NULL
);
CREATE INDEX vendor_trips_by_vendor ON vendor_trips (vendor_id, completed_at);

-- Every change to what QuikFly owes a partner: earning (+), cash a driver kept (−),
-- payout (−), payment from the partner (+), adjustment (±).
CREATE TABLE vendor_ledger (
  id           TEXT PRIMARY KEY,
  vendor_id    TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  booking_id   TEXT,
  payout_id    TEXT,
  note         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX vendor_ledger_by_vendor ON vendor_ledger (vendor_id, created_at);
-- A trip settles once, however often completion is retried.
CREATE UNIQUE INDEX vendor_ledger_trip_once ON vendor_ledger (booking_id, kind) WHERE booking_id IS NOT NULL;

CREATE TABLE vendor_payouts (
  id           TEXT PRIMARY KEY,
  vendor_id    TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount_paise INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'requested',
  reference    TEXT,
  note         TEXT,
  requested_at TEXT NOT NULL,
  decided_at   TEXT,
  admin_id     TEXT
);
CREATE INDEX vendor_payouts_by_status ON vendor_payouts (status, requested_at);
-- One open request per partner.
CREATE UNIQUE INDEX vendor_payouts_one_open ON vendor_payouts (vendor_id) WHERE status = 'requested';
