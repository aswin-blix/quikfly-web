// How the admin panel names parcel moves and states (no React). Which moves exist comes from
// staffMoves() in @quikfly/shared, the same rules the API applies.
import { staffMoves, type BookingStatus, type ParcelLeg, type ParcelQueueState, type ParcelState } from "@quikfly/shared";

/** A button, by the state it moves the parcel to. */
export const MOVE_LABEL: Record<ParcelState, string> = {
  booked: "Book",
  at_counter: "Receive at counter",
  on_bus: "Load on bus",
  reached: "Mark reached",
  ready: "Ready for collection",
  collected: "Hand over",
  unclaimed: "Mark unclaimed",
  cancelled: "Refuse on sight",
};

/** What staff check before confirming each move. */
export const MOVE_CHECK: Record<ParcelState, string> = {
  booked: "",
  at_counter: "Check the weight and size against the booking, and that nothing prohibited is inside. If either is wrong, refuse it instead.",
  on_bus: "Confirm it's on the booked bus. It can't be cancelled after this.",
  reached: "The bus has arrived and the parcel is off it.",
  ready: "It's on the shelf at the destination counter. The sender is shown the collection code and the hold period starts.",
  collected: "Ask the receiver for the code the sender gave them. Staff never see the code.",
  unclaimed: "The hold period is over and nobody collected it. The sender is told to contact support. This can't be undone.",
  cancelled: "The booking is cancelled with a full refund, whatever the policy. This can't be undone.",
};

export const PARCEL_STATE_STYLE: Record<ParcelState, string> = {
  booked: "bg-info/10 text-info",
  at_counter: "bg-info/10 text-info",
  on_bus: "bg-warning/10 text-warning",
  reached: "bg-warning/10 text-warning",
  ready: "bg-warning/10 text-warning",
  collected: "bg-success/10 text-success",
  unclaimed: "bg-danger/10 text-danger",
  cancelled: "bg-danger/10 text-danger",
};

export const QUEUE_STATE_LABEL: Partial<Record<ParcelQueueState, string>> = { open: "Open parcels", all: "All parcels" };

/** The moves open to staff; none once the booking is finished. */
export const movesFor = (p: { bookingStatus: BookingStatus; legs: ParcelLeg[]; holdUntil: string | null }) =>
  p.bookingStatus === "confirmed" || p.bookingStatus === "ongoing" ? staffMoves(p.legs, p.holdUntil) : [];

/** The queue's "Next" column. */
export function nextAction(p: { bookingStatus: BookingStatus; state: ParcelState; legs: ParcelLeg[]; holdUntil: string | null }) {
  if (p.state === "unclaimed") return "Follow up with the sender";
  // Once the hold is over a ready parcel can be handed over or marked unclaimed: handing over comes first.
  const moves = movesFor(p).filter((m) => !m.refuses);
  const move = moves.find((m) => m.needsOtp) ?? moves[0];
  return move ? MOVE_LABEL[move.state] : "None";
}
