-- Cancellation policies: a booking remembers when its trip starts (copied from the quote)
-- so the refund can be worked out from the notice given, and what was refunded.
-- Bookings and quotes made before this have no start and keep getting a full refund.
ALTER TABLE quotes ADD COLUMN starts_at TEXT;
ALTER TABLE bookings ADD COLUMN starts_at TEXT;
ALTER TABLE bookings ADD COLUMN refund_amount INTEGER;
