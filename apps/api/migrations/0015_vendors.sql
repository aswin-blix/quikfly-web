-- Vendors (partners): vehicle owners who register through the QuikFly Partner app. A vendor
-- is a signed-in user (same phone login) with one row here; its vehicles are in
-- vendor_vehicles (the first one is part of the application). Document photos live in R2
-- (binding DOCS); these tables only keep their keys. `sections` is JSON:
-- { "<section>": { "state": "pending|filled|changes|approved", "note": "…" } }.
CREATE TABLE vendors (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'draft',
  city                 TEXT,
  photo_key            TEXT,
  bank_holder          TEXT,
  bank_ifsc            TEXT,
  bank_account         TEXT,
  sections             TEXT NOT NULL DEFAULT '{}',
  joining_fee          INTEGER NOT NULL DEFAULT 0,
  paid_at              TEXT,
  agreement_at         TEXT,
  agreement_name       TEXT,
  agreement_version    TEXT,
  sticker_requested_at TEXT,
  sticker_done_at      TEXT,
  submitted_at         TEXT,
  reviewed_at          TEXT,
  note                 TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX vendors_by_status ON vendors (status, submitted_at);

CREATE TABLE vendor_vehicles (
  id                   TEXT PRIMARY KEY,
  vendor_id            TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL,
  fuel                 TEXT NOT NULL,
  reg_number           TEXT NOT NULL UNIQUE,
  purchase_date        TEXT NOT NULL,
  rc_owner             TEXT,
  rc_valid_till        TEXT,
  rc_key               TEXT,
  insurer              TEXT,
  insurance_number     TEXT,
  insurance_valid_till TEXT,
  insurance_key        TEXT,
  audit_date           TEXT,
  audit_slot           TEXT,
  audit_result         TEXT,
  audit_note           TEXT,
  status               TEXT NOT NULL DEFAULT 'pending',
  created_at           TEXT NOT NULL
);
CREATE INDEX vendor_vehicles_by_vendor ON vendor_vehicles (vendor_id);
