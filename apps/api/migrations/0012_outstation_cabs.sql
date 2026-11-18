-- Outstation cabs: a sedan and an SUV join the group-vehicle catalog (the Innova Crysta is
-- already there), so small groups and solo travellers can book an intercity cab. Added only
-- if missing, so databases seeded before keep their edits; staff can change or hide them.
INSERT OR IGNORE INTO catalog_items (kind, id, data, active, sort, updated_at) VALUES
  ('travelVehicle', 'tv6', '{"id":"tv6","name":"Sedan (Swift Dzire or similar)","seats":4,"perKm":12,"minKmPerDay":250,"driverBataPerDay":300,"localPackage":2000,"features":["AC","Boot for 2 bags","Outstation cab"]}', 1, -2, '2026-11-18T00:00:00.000Z'),
  ('travelVehicle', 'tv7', '{"id":"tv7","name":"SUV (Maruti Ertiga or similar)","seats":6,"perKm":15,"minKmPerDay":250,"driverBataPerDay":350,"localPackage":2400,"features":["AC","Roof carrier","Outstation cab"]}', 1, -1, '2026-11-18T00:00:00.000Z');
