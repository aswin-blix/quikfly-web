-- Dispatch (step 2 of docs/driver-app-plan.md).
-- One offer per step of a ride's search: two requests advancing the same ride can't both offer it.
CREATE UNIQUE INDEX ride_offers_step_once ON ride_offers (ride_id, seq);
-- Why a captain gave an accepted ride back (CAPTAIN_RELEASE_REASONS), for staff.
ALTER TABLE ride_offers ADD COLUMN reason TEXT;
