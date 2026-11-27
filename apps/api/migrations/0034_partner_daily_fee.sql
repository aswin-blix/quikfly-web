-- The flat daily fee (setting vendorFlatDailyFee): instead of commission on every city ride, a
-- driver's first completed ride of an India day charges the vehicle's owner one fee. This table
-- is the "once per driver per day" guard; the money itself is a vendor_ledger row of kind 'fee'
-- written in the same batch, tied to the booking that triggered it.
CREATE TABLE vendor_day_fees (
  unit_id      TEXT NOT NULL,               -- the driver; the vehicle when a trip has no driver
  day          TEXT NOT NULL,               -- India date, YYYY-MM-DD
  vendor_id    TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  booking_id   TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (unit_id, day)
);
CREATE INDEX vendor_day_fees_by_vendor ON vendor_day_fees (vendor_id, day);
