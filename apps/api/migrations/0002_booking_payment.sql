-- How each booking was paid, so wallet payments can be refunded on cancel.
-- Bookings made before this column existed are treated as paid outside the wallet.
ALTER TABLE bookings ADD COLUMN payment TEXT NOT NULL DEFAULT 'upi';
