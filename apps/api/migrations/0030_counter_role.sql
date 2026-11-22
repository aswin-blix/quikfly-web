-- Counter logins (docs/parcel-service-plan.md, step 7): staff role 'counter' works for one bus
-- operator in one city. JSON {"operatorId":"bo1","city":"Chennai"}; NULL for every other role.
-- Adds a column only: no existing row changes, and an API from before it ignores the column.
ALTER TABLE admin_users ADD COLUMN scope TEXT;
