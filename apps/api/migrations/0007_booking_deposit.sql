-- The refundable deposit inside a booking's amount (self-drive), copied from the quote's
-- deposit line. It is always returned in full on cancel, and on completion once staff
-- confirm the return. Bookings made before this have 0 (their deposit stays in the amount).
ALTER TABLE bookings ADD COLUMN deposit INTEGER NOT NULL DEFAULT 0;
