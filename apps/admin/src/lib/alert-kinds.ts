// How each kind of staff alert looks in the panel (icon, urgency), shared by the Alerts page, the
// bell menu and the pop-ups. Which page an alert belongs to is SECTION_KINDS in ./alerts.
import { Bell, Handshake, Headphones, IdCard, PackageX, Siren, type LucideIcon } from "lucide-react";
import type { StaffAlertKind } from "@quikfly/shared";

export const ALERT_ICON: Record<StaffAlertKind, LucideIcon> = {
  "sos.raised": Siren,
  "support.ticket": Headphones,
  "support.reply": Headphones,
  "support.callback": Headphones,
  "vendor.applied": Handshake,
  "vendor.fleet": Handshake,
  "vendor.payout": Handshake,
  "licence.submitted": IdCard,
  "parcel.unclaimed": PackageX,
};

export const alertIcon = (kind: StaffAlertKind): LucideIcon => ALERT_ICON[kind] ?? Bell;

/** An SOS is the one urgent kind: red, its own banner and tone, never auto-dismissed. */
export const isUrgent = (kind: StaffAlertKind) => kind === "sos.raised";
