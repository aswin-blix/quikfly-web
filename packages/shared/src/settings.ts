// Business settings an owner changes from the admin panel. The API stores them in the
// `settings` table and falls back to these defaults; `GET /config` hands the public ones
// to the website and the app. Add a key here, then validate it in routes/admin/settings.ts.

export interface Settings {
  /** Verify a submitted driving licence at once instead of waiting for an admin (unattended demos). */
  licenceAutoApprove: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  licenceAutoApprove: false,
};
