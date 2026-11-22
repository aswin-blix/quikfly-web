-- Parcels (docs/parcel-service-plan.md, step 1). A parcel is a booking (service 'parcel') plus a
-- parcels row whose journey is an ordered list of legs with an event log. 0028 is left for
-- family profiles (docs/family-profiles-plan.md); wrangler applies it whenever it is added.
CREATE TABLE parcels (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
  user_id TEXT NOT NULL,                    -- the sender
  lr TEXT NOT NULL UNIQUE,                  -- opens the public tracking page: long and random
  mode TEXT NOT NULL CHECK (mode IN ('city', 'intercity')),
  state TEXT NOT NULL,                      -- derived from the legs (parcelState)
  move_id TEXT NOT NULL,                    -- changes with every move: a mover must still see the id it read
  next_at TEXT,                             -- when the simulated carrier next moves it
  from_city TEXT, to_city TEXT,
  pickup_place_id TEXT, drop_place_id TEXT, -- Quick parcels and door legs
  depart_at TEXT, ready_at TEXT,
  from_counter TEXT, to_counter TEXT,       -- JSON copies, so catalog edits don't change a booked parcel
  category TEXT NOT NULL,
  weight_band TEXT NOT NULL,
  size TEXT NOT NULL,
  declared_value INTEGER NOT NULL,
  liability_cap INTEGER NOT NULL,
  contents TEXT NOT NULL,                   -- '' once erased
  receiver_name TEXT NOT NULL,              -- '' once erased
  receiver_phone TEXT NOT NULL,             -- '' once erased
  receiver_user_id TEXT,                    -- for the receiver's export and erasure only: grants no access
  pickup_kind TEXT NOT NULL CHECK (pickup_kind IN ('counter', 'door')),
  delivery_kind TEXT NOT NULL CHECK (delivery_kind IN ('counter', 'door')),
  declaration_version TEXT NOT NULL,
  -- Not hashed: the sender's screen has to show it (demo: no SMS). Set only while ready, never exported.
  collect_otp TEXT,
  otp_tries INTEGER NOT NULL DEFAULT 0,
  otp_locked_until TEXT,
  hold_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX parcels_by_user ON parcels (user_id);
CREATE INDEX parcels_by_state ON parcels (state, to_city);
CREATE INDEX parcels_by_receiver ON parcels (receiver_user_id);
CREATE INDEX parcels_due ON parcels (next_at) WHERE next_at IS NOT NULL;

CREATE TABLE parcel_legs (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES parcels(booking_id),
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bike', 'bus', 'counter')),
  state TEXT NOT NULL CHECK (state IN ('pending', 'active', 'done', 'failed')),
  operator_id TEXT,
  counter_id TEXT,
  bus_id TEXT, bus_date TEXT, depart_at TEXT,
  ride_id TEXT, leg_booking_id TEXT,        -- bike legs
  planned_at TEXT, started_at TEXT, ended_at TEXT,
  note TEXT,
  UNIQUE (booking_id, seq)
);

CREATE TABLE parcel_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES parcels(booking_id),
  state TEXT NOT NULL,
  note TEXT,                                -- shown to the sender, never on the tracking page
  by_admin_id TEXT,                         -- null: the customer or the simulated carrier
  at TEXT NOT NULL
);
CREATE INDEX parcel_events_by_booking ON parcel_events (booking_id, at);

-- Production was seeded before parcels existed and the seed runs once, so the demo counters and
-- rates come in here (as in 0012). Generated from PARCEL_COUNTERS and PARCEL_RATES (catalog.ts).
INSERT OR IGNORE INTO catalog_items (kind, id, data, active, sort, updated_at) VALUES
  ('parcelCounter', 'pc1', '{"id":"pc1","operatorId":"bo1","city":"Chennai","name":"QuikFly Parcel, Chennai","address":"Main bus stand, Chennai (demo address)","hours":"6 AM – 10 PM","phone":"1800 123 4567"}', 1, 10, '2026-11-22T00:00:00.000Z'),
  ('parcelCounter', 'pc2', '{"id":"pc2","operatorId":"bo1","city":"Bengaluru","name":"QuikFly Parcel, Bengaluru","address":"Main bus stand, Bengaluru (demo address)","hours":"6 AM – 10 PM","phone":"1800 123 4567"}', 1, 20, '2026-11-22T00:00:00.000Z'),
  ('parcelCounter', 'pc3', '{"id":"pc3","operatorId":"bo1","city":"Coimbatore","name":"QuikFly Parcel, Coimbatore","address":"Main bus stand, Coimbatore (demo address)","hours":"6 AM – 10 PM","phone":"1800 123 4567"}', 1, 30, '2026-11-22T00:00:00.000Z'),
  ('parcelCounter', 'pc4', '{"id":"pc4","operatorId":"bo1","city":"Madurai","name":"QuikFly Parcel, Madurai","address":"Main bus stand, Madurai (demo address)","hours":"6 AM – 10 PM","phone":"1800 123 4567"}', 1, 40, '2026-11-22T00:00:00.000Z'),
  ('parcelCounter', 'pc5', '{"id":"pc5","operatorId":"bo1","city":"Hyderabad","name":"QuikFly Parcel, Hyderabad","address":"Main bus stand, Hyderabad (demo address)","hours":"6 AM – 10 PM","phone":"1800 123 4567"}', 1, 50, '2026-11-22T00:00:00.000Z'),
  ('parcelCounter', 'pc6', '{"id":"pc6","operatorId":"bo1","city":"Pondicherry","name":"QuikFly Parcel, Pondicherry","address":"Main bus stand, Pondicherry (demo address)","hours":"6 AM – 10 PM","phone":"1800 123 4567"}', 1, 60, '2026-11-22T00:00:00.000Z'),
  ('parcelCounter', 'pc7', '{"id":"pc7","operatorId":"bo1","city":"Trichy","name":"QuikFly Parcel, Trichy","address":"Main bus stand, Trichy (demo address)","hours":"6 AM – 10 PM","phone":"1800 123 4567"}', 1, 70, '2026-11-22T00:00:00.000Z'),
  ('parcelCounter', 'pc8', '{"id":"pc8","operatorId":"bo1","city":"Kochi","name":"QuikFly Parcel, Kochi","address":"Main bus stand, Kochi (demo address)","hours":"6 AM – 10 PM","phone":"1800 123 4567"}', 1, 80, '2026-11-22T00:00:00.000Z'),
  ('parcelRate', 'pr1', '{"id":"pr1","operatorId":"bo1","from":"Chennai","to":"Bengaluru","price2":70,"price5":100,"price10":150,"price20":260,"transitHours":null,"cutoffMinutes":null}', 1, 10, '2026-11-22T00:00:00.000Z'),
  ('parcelRate', 'pr2', '{"id":"pr2","operatorId":"bo1","from":"Chennai","to":"Coimbatore","price2":80,"price5":120,"price10":180,"price20":300,"transitHours":null,"cutoffMinutes":null}', 1, 20, '2026-11-22T00:00:00.000Z'),
  ('parcelRate', 'pr3', '{"id":"pr3","operatorId":"bo1","from":"Chennai","to":"Madurai","price2":80,"price5":110,"price10":170,"price20":280,"transitHours":null,"cutoffMinutes":null}', 1, 30, '2026-11-22T00:00:00.000Z'),
  ('parcelRate', 'pr4', '{"id":"pr4","operatorId":"bo1","from":"Bengaluru","to":"Hyderabad","price2":90,"price5":130,"price10":190,"price20":320,"transitHours":null,"cutoffMinutes":null}', 1, 40, '2026-11-22T00:00:00.000Z'),
  ('parcelRate', 'pr5', '{"id":"pr5","operatorId":"bo1","from":"Chennai","to":"Pondicherry","price2":60,"price5":70,"price10":110,"price20":200,"transitHours":null,"cutoffMinutes":null}', 1, 50, '2026-11-22T00:00:00.000Z'),
  ('parcelRate', 'pr6', '{"id":"pr6","operatorId":"bo1","from":"Coimbatore","to":"Kochi","price2":60,"price5":80,"price10":120,"price20":210,"transitHours":null,"cutoffMinutes":null}', 1, 60, '2026-11-22T00:00:00.000Z'),
  ('parcelRate', 'pr7', '{"id":"pr7","operatorId":"bo1","from":"Chennai","to":"Trichy","price2":70,"price5":95,"price10":140,"price20":250,"transitHours":null,"cutoffMinutes":null}', 1, 70, '2026-11-22T00:00:00.000Z'),
  ('parcelRate', 'pr8', '{"id":"pr8","operatorId":"bo1","from":"Madurai","to":"Bengaluru","price2":80,"price5":110,"price10":160,"price20":270,"transitHours":null,"cutoffMinutes":null}', 1, 80, '2026-11-22T00:00:00.000Z');
