-- Rider cancellations (MVAG 2025): the reason given and any cancellation fee kept or owed.
ALTER TABLE bookings ADD COLUMN cancel_reason TEXT;
ALTER TABLE bookings ADD COLUMN cancel_fee INTEGER NOT NULL DEFAULT 0;
