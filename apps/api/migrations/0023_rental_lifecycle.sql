-- Self-drive rental lifecycle (packages/shared/src/rental.ts): one row per self-drive booking,
-- the customer's pickup and return readings and photos, extensions, and the staff settlement.

CREATE TABLE rentals (
  booking_id         TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  start_local        TEXT NOT NULL,              -- booked pickup, local India "YYYY-MM-DDTHH:mm"
  ends_at            TEXT NOT NULL,              -- current return time; extensions move it
  km_plan            TEXT NOT NULL,              -- limited | unlimited
  hourly_rate        INTEGER NOT NULL,           -- ₹/hour as booked (plan included), for extensions and late fees
  protection_per_day INTEGER NOT NULL DEFAULT 0,
  pickup_odometer    INTEGER,
  pickup_fuel        INTEGER,                    -- eighths of a tank, 0–8
  pickup_at          TEXT,
  return_odometer    INTEGER,
  return_fuel        INTEGER,
  return_at          TEXT,
  settlement         TEXT,                       -- RentalSettlement JSON once staff settle
  created_at         TEXT NOT NULL
);

CREATE TABLE rental_photos (
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  stage      TEXT NOT NULL,                      -- pickup | return
  side       TEXT NOT NULL,                      -- front | back | left | right | odometer
  photo_key  TEXT NOT NULL,                      -- R2 key in the DOCS bucket
  created_at TEXT NOT NULL,
  PRIMARY KEY (booking_id, stage, side)
);

CREATE TABLE rental_extensions (
  id         TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  hours      INTEGER NOT NULL,
  amount     INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX rental_extensions_by_booking ON rental_extensions (booking_id, created_at);

-- Active self-drive bookings made before this migration get a rental too, from their quote.
-- The unlimited-km uplift (25%) and protection per day (199 / 399) are the defaults of the time.
INSERT INTO rentals (booking_id, start_local, ends_at, km_plan, hourly_rate, protection_per_day, created_at)
SELECT b.id,
       json_extract(q.request, '$.start'),
       json_extract(q.request, '$.end'),
       json_extract(q.request, '$.kmPlan'),
       CAST(ROUND(json_extract(c.data, '$.pricePerHour') * CASE WHEN json_extract(q.request, '$.kmPlan') = 'unlimited' THEN 1.25 ELSE 1 END) AS INTEGER),
       CASE json_extract(q.request, '$.protection') WHEN 'peace' THEN 399 ELSE 199 END,
       b.created_at
FROM bookings b
JOIN quotes q ON q.id = b.quote_id
JOIN catalog_items c ON c.kind = 'rentalCar' AND c.id = json_extract(q.request, '$.carId')
WHERE b.service = 'rent' AND b.status IN ('confirmed', 'ongoing') AND json_extract(q.request, '$.mode') = 'self';
