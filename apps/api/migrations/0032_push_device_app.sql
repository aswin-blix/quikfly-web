-- Which phone app registered a push token (customer | partner; NULL = a browser, which gets every kind).
-- Without it both apps on one phone got every notification of the account (found in the app 0.1.18 phone check).
ALTER TABLE push_devices ADD COLUMN app TEXT;
