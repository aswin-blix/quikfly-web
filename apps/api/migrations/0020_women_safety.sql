-- Women-only rides (B8) and Safety Preferences.
-- Automatic trip sharing: off, night rides only, or every ride (replaces the night-only flag,
-- which older apps still read and write; it maps to "night").
ALTER TABLE users ADD COLUMN auto_share_mode TEXT NOT NULL DEFAULT 'off';
UPDATE users SET auto_share_mode = 'night' WHERE auto_share_night = 1;
-- The rider's own 4-digit ride PIN, used instead of a new code each ride (null = new code).
ALTER TABLE users ADD COLUMN ride_pin TEXT;
-- Bike Pink (women riders, women captains) next to the other bikes, and two women captains.
-- Added only if missing, so databases seeded before keep their edits; staff can change or hide them.
INSERT OR IGNORE INTO catalog_items (kind, id, data, active, sort, updated_at) VALUES
  ('rideOption', 'pink', '{"id":"pink","service":"bike","name":"Bike Pink","description":"Women riders, women captains","seats":1,"baseFare":20,"perKm":6,"perMin":0.5,"models":["Honda Activa 6G","TVS Jupiter"],"riders":"women"}', 1, 25, '2026-11-19T00:00:00.000Z'),
  ('driver', 'd5', '{"id":"d5","name":"Lakshmi R","rating":4.9,"trips":1240,"phone":"+91 98840 55621","gender":"female"}', 1, 50, '2026-11-19T00:00:00.000Z'),
  ('driver', 'd6', '{"id":"d6","name":"Priya S","rating":4.8,"trips":860,"phone":"+91 97100 33417","gender":"female"}', 1, 60, '2026-11-19T00:00:00.000Z');
