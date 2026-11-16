// Tunable business values in one place. Nothing here is secret.

export const API_PREFIX = "/v1";

export const SESSION_TTL_DAYS = 30;
export const NEW_USER_WALLET_BALANCE = 500;
export const DEFAULT_USER_NAME = "Guest";
export const PHONE_COUNTRY_CODE = "+91";
export const PHONE_DIGITS = 10;

/** Fares are computed in Indian time, whatever region the Worker runs in. */
export const BUSINESS_UTC_OFFSET_MIN = 330;

export const RIDE = {
  minDistanceKm: 1.5,
  /** Converts demo-map units to kilometres. */
  kmPerMapUnit: 0.32,
  speedKmh: { bike: 24, car: 20 },
  pickupBufferMin: 3,
  surgeMultiplier: 1.2,
  /** Inclusive [fromHour, toHour] windows when surge applies. */
  surgeHours: [[8, 10], [17, 20]] as [number, number][],
  plateStates: ["TN 09", "TN 07", "TN 22", "TN 10"],
  plateLetters: ["AB", "CK", "BZ", "DM", "EQ"],
};

export const BUS = {
  resultsPerSearch: 7,
  firstDepartureHour: 16,
  types: [
    { type: "A/C Sleeper (2+1)", ac: true, sleeper: true },
    { type: "A/C Seater / Sleeper (2+1)", ac: true, sleeper: true },
    { type: "Volvo Multi-Axle A/C Seater (2+2)", ac: true, sleeper: false },
    { type: "Non A/C Seater (2+2)", ac: false, sleeper: false },
    { type: "Bharat Benz A/C Sleeper (2+1)", ac: true, sleeper: true },
  ],
  amenities: ["Water bottle", "Charging point", "Blanket", "Reading light", "Live tracking", "CCTV"],
  baseFare: { ac: 650, nonAc: 420, sleeperExtra: 250, randomExtra: 400 },
  seatRowsPerDeck: 6,
  seatColsPerRow: 3,
  bookedChance: 0.38,
  ladiesChance: 0.08,
};

export const SERVICE_KEYS = ["bike", "car", "bus", "tours", "rent", "rentals"] as const;
export const PAYMENT_METHODS = ["cash", "upi", "wallet", "card"] as const;
export const MAX_BOOKING_LINES = 30;
