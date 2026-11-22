"use client";
// /notifications: the customer's inbox (booking confirmed, refunds, licence decisions, ride
// reminders). Opening it marks everything read; unread ones keep their highlight until you leave.
import { useEffect, useState } from "react";
import { Bell, BadgeCheck, CalendarClock, CircleX, Coins, Handshake, Headphones, IdCard, Package, PackageCheck, RotateCcw, Ticket, Wallet } from "lucide-react";
import type { AppNotification, NotificationKind } from "@quikfly/shared";
import { useApp } from "@/components/AppProvider";
import { Empty, GoldButton, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cx, prettyDateTime } from "@/lib/format";
import { Link, qs } from "@/lib/nav";

const ICON: Record<NotificationKind, typeof Bell> = {
  "booking.confirmed": Ticket,
  "booking.cancelled": RotateCcw,
  "booking.cancelled_by_staff": CircleX,
  "booking.deposit_returned": Wallet,
  "booking.changed": Ticket,
  "licence.approved": BadgeCheck,
  "licence.rejected": IdCard,
  "ride.reminder": CalendarClock,
  "credits.earned": Coins,
  "support.reply": Headphones,
  "parcel.moved": Package,
  "parcel.ready": PackageCheck,
  "parcel.collected": PackageCheck,
  "parcel.unclaimed": Package,
  // Partner notifications are read in the QuikFly Partner app; listed here in case one shows up.
  "vendor.changes": Handshake,
  "vendor.approved": Handshake,
  "vendor.rejected": Handshake,
  "vendor.active": Handshake,
  "vendor.fleet": Handshake,
  "vendor.document": Handshake,
  "vendor.trip": Handshake,
  "vendor.payout": Handshake,
};

/** Where tapping a notification goes. */
const target = (n: AppNotification) =>
  n.kind === "credits.earned" ? "/account?tab=wallet" : n.kind === "support.reply" ? "/account?tab=support" : n.bookingId ? (n.kind.startsWith("parcel.") ? `/bookings${qs({ open: n.bookingId })}` : "/bookings") : n.kind.startsWith("licence") ? "/account?tab=licence" : null;

export function NotificationsScreen() {
  const { user, requireAuth, refreshNotifications } = useApp();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const signedIn = !!user;

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    api.notifications.list().then(async ({ items: list, unread }) => {
      if (!live) return;
      setItems(list);
      if (unread) { await api.notifications.markRead(); refreshNotifications(); }
    }, () => live && setItems([]));
    return () => { live = false; };
  }, [signedIn, refreshNotifications]);

  const shell = (node: React.ReactNode) => <div className="max-w-2xl mx-auto px-4 pt-10"><h1 className="font-display text-3xl sm:text-4xl mb-6">Notifications</h1>{node}</div>;
  if (!user) return shell(<div className="panel"><Empty icon={<Bell size={40} />} text="Sign in to see your notifications." action={<GoldButton onClick={() => requireAuth(() => undefined)}>Login</GoldButton>} /></div>);
  if (!items) return shell(<div className="py-16 grid place-items-center text-gold"><Spinner size={26} /></div>);
  if (!items.length) return shell(<div className="panel"><Empty icon={<Bell size={40} />} text="Nothing yet. Bookings, refunds and ride reminders show up here." /></div>);

  return shell(
    <ul className="space-y-2">
      {items.map((n) => {
        const Icon = ICON[n.kind] ?? Bell;
        const body = (
          <div className={cx("panel p-4 flex gap-3 items-start transition-colors", !n.readAt && "!border-gold/50 bg-gold/[0.04]")}>
            <span className="w-10 h-10 shrink-0 rounded-xl bg-gold/10 text-gold grid place-items-center"><Icon size={19} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{n.title}</p>
              <p className="text-sm text-muted">{n.body}</p>
              <p className="text-[11px] text-subtle mt-1">{prettyDateTime(n.createdAt)}</p>
            </div>
            {!n.readAt && <span className="w-2 h-2 rounded-full bg-brand mt-2" aria-label="Unread" />}
          </div>
        );
        const href = target(n);
        return <li key={n.id}>{href ? <Link href={href} className="block">{body}</Link> : body}</li>;
      })}
    </ul>,
  );
}
