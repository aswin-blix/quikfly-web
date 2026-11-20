-- Self-drive damage cap (pricing audit R2): the excess of the protection plan the customer
-- bought ("You pay up to ₹X for damage"), copied from Settings at booking so a later change
-- doesn't move it. Staff can't deduct more damage than this. Rentals booked before this
-- migration have NULL; the API then uses the plan their stored daily protection price matches.
ALTER TABLE rentals ADD COLUMN damage_excess INTEGER;
