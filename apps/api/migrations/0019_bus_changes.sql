-- Bus booking changes: cancel some seats, move once to another bus or date, and an m-ticket.
-- What each held seat cost (₹ before GST), so a seat's share of the booking can be refunded;
-- seats held before this migration have 0 and split the booking evenly.
ALTER TABLE bus_seat_holds ADD COLUMN price INTEGER NOT NULL DEFAULT 0;
-- When the booking moved to another bus (allowed once).
ALTER TABLE bookings ADD COLUMN rescheduled_at TEXT;
-- The m-ticket's QR code opens GET /tickets/:token (public, so a conductor can check it).
ALTER TABLE bookings ADD COLUMN ticket_token TEXT;
UPDATE bookings SET ticket_token = lower(hex(randomblob(12))) WHERE service = 'bus';
CREATE UNIQUE INDEX bookings_ticket_token ON bookings (ticket_token) WHERE ticket_token IS NOT NULL;
