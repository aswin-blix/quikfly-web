-- Captain step 5 (docs/driver-app-plan.md): the dispatch log shows how far each captain was from the pickup when offered.
ALTER TABLE ride_offers ADD COLUMN km REAL;
