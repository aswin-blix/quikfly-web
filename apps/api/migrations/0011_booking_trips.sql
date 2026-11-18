-- Trips: bookings that belong together (a bus and the cab to its boarding point). Every
-- booking in a trip carries the same trip_id: the id of the booking the trip started from.
ALTER TABLE bookings ADD COLUMN trip_id TEXT;
CREATE INDEX bookings_trip ON bookings (trip_id);
