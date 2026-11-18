// Site-wide facts that are not tied to a theme or a screen.

/** Seller details printed on invoices. Placeholder values until the client provides real ones. */
export const COMPANY = {
  legalName: "QuikFly Mobility Pvt. Ltd.",
  address: "Chennai, Tamil Nadu, India",
  gstin: "33AAACQ0000A1Z5",
  email: "support@quikfly.in",
  phone: "1800 123 4567",
} as const;

export const AUTHOR = {
  name: "Aswin Blix",
  url: "https://aswinblix.dev/",
} as const;

/**
 * The Android app: a signed APK on GitHub Releases (no Play Store until the client signs off).
 * The "latest" links always serve the newest release, so they don't change per version.
 */
export const ANDROID_APP = {
  downloadUrl: "https://github.com/aswin-blix/quikfly-web/releases/latest/download/QuikFly-arm64.apk",
  /** Release page: install steps, the file for older (32-bit) phones, checksums. */
  releaseUrl: "https://github.com/aswin-blix/quikfly-web/releases/latest",
  size: "about 22 MB",
  minAndroid: "Android 7.0+",
} as const;

/**
 * The QuikFly Partner app for vehicle owners (Android, GitHub Releases; first release app-v0.1.6).
 * Set downloadUrl to null to make the /partner page show "coming soon" instead.
 */
export const PARTNER_APP: { downloadUrl: string | null; releaseUrl: string } = {
  downloadUrl: "https://github.com/aswin-blix/quikfly-web/releases/latest/download/QuikFlyPartner-arm64.apk",
  /** Release page: install steps, the file for older (32-bit) phones, checksums. */
  releaseUrl: "https://github.com/aswin-blix/quikfly-web/releases/latest",
};
