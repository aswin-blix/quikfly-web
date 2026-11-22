// Parcel helpers for screens (no React): labels, the tracking link and the booking's LR number.
import { PARCEL_LR_LINE, type Booking, type ParcelCategory, type ParcelMode, type ParcelSize, type ParcelState } from "@quikfly/shared";
import { qs } from "./nav";

/** How often an open parcel or tracking page re-checks while the tab is visible. */
export const PARCEL_POLL_MS = 30_000;
/** A price this close to expiring is fetched again before checkout. */
export const PARCEL_QUOTE_MARGIN_MS = 5 * 60_000;
/** Wait for typing to stop before asking the API for a price. */
export const PARCEL_QUOTE_DEBOUNCE_MS = 500;

export const CATEGORY_LABEL: Record<ParcelCategory, string> = {
  documents: "Documents", clothes: "Clothes", food: "Food", electronics: "Electronics", medicines: "Medicines", gifts: "Gifts", other: "Other",
};
export const SIZE_LABEL: Record<ParcelSize, string> = { backpack: "Fits a backpack", box: "A box" };

export const PARCEL_CHIP: Record<ParcelState, string> = {
  booked: "bg-success/10 text-success",
  at_counter: "bg-success/10 text-success",
  on_bus: "bg-gold/10 text-gold",
  reached: "bg-gold/10 text-gold",
  ready: "bg-gold/10 text-gold",
  collected: "bg-fg/5 text-muted",
  unclaimed: "bg-danger/10 text-danger",
  cancelled: "bg-danger/10 text-danger",
  in_transit: "bg-gold/10 text-gold",
  delivered: "bg-fg/5 text-muted",
  returned: "bg-danger/10 text-danger",
};

export const parcelLrOf = (b: Booking) => b.lines.find(([k]) => k === PARCEL_LR_LINE)?.[1] ?? null;

/** The public page (first names only), for the receiver. */
export const parcelTrackPath = (lr: string) => `/parcels/track${qs({ lr })}`;
export const parcelTrackUrl = (lr: string) => `${location.origin}${parcelTrackPath(lr)}`;

/** What "Share" sends. Never the collection code, a name or the contents. */
export const parcelShareText = (lr: string, mode: ParcelMode, from: string, to: string) =>
  mode === "city"
    ? `A QuikFly parcel (${lr}) is on its way in ${to}. Follow it here; to receive it you'll need the code from the sender.`
    : `A QuikFly parcel (${lr}) is booked from ${from} to ${to}. Follow it here; to collect it you'll need the code from the sender.`;
