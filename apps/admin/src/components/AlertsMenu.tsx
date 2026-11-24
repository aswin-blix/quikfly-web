"use client";
// The bell: unread count, and a menu of the newest alerts (each opens its page), "Mark all read",
// the sound switch and a link to the Alerts page. In the phone top bar and the desktop top bar.
// Hidden for roles without alerts.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Bell, CheckCheck, Volume2, VolumeX } from "lucide-react";
import { alertIcon, isUrgent } from "@/lib/alert-kinds";
import { useAlerts } from "@/lib/alerts";
import { cx, dateTime, timeAgo } from "@/lib/format";

/** How many alerts the menu lists; the Alerts page has the rest. */
const MENU_ITEMS = 8;

export function AlertsMenu({ phone }: { phone?: boolean }) {
  const { enabled, unread, items, markRead, muted, setMuted } = useAlerts();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!enabled) return null;
  const list = (items ?? []).slice(0, MENU_ITEMS);
  return (
    <div ref={box} className={cx(!phone && "relative")}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true"
        aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}
        className={cx("relative size-9 grid place-items-center rounded-field hover:text-fg hover:bg-raised", open ? "text-fg bg-raised" : "text-muted")}>
        <Bell size={18} />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-on-danger text-[10px] font-bold grid place-items-center leading-none">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Alerts"
          className={cx("popover popover-enter z-50 flex flex-col overflow-hidden",
            phone ? "fixed inset-x-3 top-[3.75rem] max-h-[calc(100dvh-5rem)]" : "absolute right-0 top-full mt-2 w-[24rem] max-h-[min(34rem,calc(100dvh-6rem))]")}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
            <p className="flex-1 font-semibold text-strong">Alerts{unread > 0 && <span className="ml-1.5 text-sm font-normal text-muted">{unread} unread</span>}</p>
            <button onClick={() => setMuted(!muted)} aria-label={muted ? "Turn alert sounds on" : "Mute alert sounds"} title={muted ? "Sounds off" : "Sounds on"}
              className="size-8 grid place-items-center rounded-field text-muted hover:text-fg hover:bg-raised">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            {unread > 0 && (
              <button onClick={() => markRead()} className="inline-flex items-center gap-1 rounded-field px-2 py-1 text-xs font-medium text-muted hover:text-fg hover:bg-raised">
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>

          {items === null && <div className="p-4 grid gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12" />)}</div>}
          {items !== null && list.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">Nothing waiting. New alerts pop up here as they arrive.</p>}
          {list.length > 0 && (
            <ul className="overflow-y-auto divide-y divide-line">
              {list.map((a) => {
                const Icon = alertIcon(a.kind);
                const urgent = isUrgent(a.kind);
                return (
                  <li key={a.id}>
                    <Link href={a.link} onClick={() => { if (!a.readAt) markRead([a.id]); setOpen(false); }}
                      className={cx("flex items-start gap-3 px-4 py-3 hover:bg-raised", !a.readAt && (urgent ? "bg-danger/5" : "bg-accent/5"))}>
                      <span className={cx("size-8 shrink-0 rounded-field grid place-items-center", urgent ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent")}><Icon size={16} /></span>
                      <span className="flex-1 min-w-0">
                        <span className={cx("block text-sm leading-snug", a.readAt ? "text-fg" : "font-semibold text-strong")}>{a.title}</span>
                        <span className="block text-xs text-muted leading-snug truncate">{a.body}</span>
                        <span className="block text-[11px] text-subtle mt-0.5" title={dateTime(a.createdAt)}>{timeAgo(a.createdAt)}</span>
                      </span>
                      {!a.readAt && <span className={cx("size-2 rounded-full mt-1.5 shrink-0", urgent ? "bg-danger" : "bg-accent")} aria-label="Unread" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <Link href="/alerts" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1 px-4 py-3 border-t border-line text-sm font-semibold text-accent hover:bg-raised">
            See all alerts <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
