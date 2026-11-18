-- Seats held by real bus bookings, so a seat can't be sold twice and the women-first
-- rule (a seat next to a woman is for women only) works across customers. Written in the
-- same transaction as the booking; deleted when the booking is cancelled.
CREATE TABLE bus_seat_holds (
  bus_id TEXT NOT NULL,
  date TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  gender TEXT NOT NULL,
  PRIMARY KEY (bus_id, date, seat_id)
);
CREATE INDEX bus_seat_holds_booking ON bus_seat_holds (booking_id);
