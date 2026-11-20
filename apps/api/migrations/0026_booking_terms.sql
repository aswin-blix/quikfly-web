-- Pricing step 3 (docs/admin-settings-audit.md R9): the settings a booking was sold under
-- (packages/shared/src/terms.ts), as JSON. Refunds, bus changes, the self-drive settlement,
-- partner earnings and invoices use them. NULL for older bookings: they use today's settings.
ALTER TABLE bookings ADD COLUMN terms TEXT;
