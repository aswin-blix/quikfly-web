-- Scheduled rides start when the rider taps "Start ride" near pickup time; the share link
-- and the live simulation count from then. Ride-now rides start when booked (NULL here).
ALTER TABLE rides ADD COLUMN started_at TEXT;
