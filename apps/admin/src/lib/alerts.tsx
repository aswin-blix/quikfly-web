"use client";
// Staff alerts across the panel: one poll of GET /admin/alerts feeds the bell, the sidebar counts,
// the SOS banner and tone, and the tab title. Opening a section (e.g. Support) marks its alerts
// seen. Only roles with `alerts.view` (owner, operations) have alerts; others see none of this.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { StaffAlert, StaffAlertKind } from "@quikfly/shared";
import { adminApi } from "./api";
import { dropPush, pausePush, resumePush } from "./push";
import { useSession } from "./session";
import { playSosTone, primeAudio } from "./tone";
import { ADMIN_UNAUTHORIZED_EVENT } from "./api";

/** How often the panel checks for new alerts (hidden tabs are slowed down by the browser itself). */
export const ALERTS_POLL_MS = 30_000;
/** Per-viewer choice to silence the SOS tone (this browser only). */
const SOS_MUTE_KEY = "quikfly.admin.sosMute";

/** Which page an alert belongs to: opening it marks those alerts seen, and its sidebar entry shows the count. */
export const SECTION_KINDS: Record<string, StaffAlertKind[]> = {
  "/sos": ["sos.raised"],
  "/support": ["support.ticket", "support.reply", "support.callback"],
  "/vendors": ["vendor.applied", "vendor.fleet", "vendor.payout"],
  "/licences": ["licence.submitted"],
  "/parcels": ["parcel.unclaimed"],
};

interface AlertsState {
  items: StaffAlert[] | null;
  unread: number;
  /** Unread alerts per sidebar section (keys of SECTION_KINDS). */
  bySection: Record<string, number>;
  /** A new SOS arrived since the panel was opened (cleared by dismissing the banner or opening SOS alerts). */
  newSos: boolean;
  dismissSos: () => void;
  muted: boolean;
  setMuted: (m: boolean) => void;
  /** VAPID key for browser push, or null when it's switched off. */
  pushKey: string | null;
  refresh: () => Promise<void>;
  markRead: (ids?: string[]) => Promise<void>;
  /** True when this role has alerts at all. */
  enabled: boolean;
}

const Ctx = createContext<AlertsState | null>(null);

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { admin, can } = useSession();
  const enabled = !!admin && can("alerts.view");
  const path = usePathname();
  const [items, setItems] = useState<StaffAlert[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [newSos, setNewSos] = useState(false);
  const [muted, setMutedState] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const mutedRef = useRef(false);

  useEffect(() => {
    try { const m = localStorage.getItem(SOS_MUTE_KEY) === "1"; setMutedState(m); mutedRef.current = m; } catch { /* default: sound on */ }
  }, []);
  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    mutedRef.current = m;
    try { if (m) localStorage.setItem(SOS_MUTE_KEY, "1"); else localStorage.removeItem(SOS_MUTE_KEY); } catch { /* this visit only */ }
  }, []);

  // Sound needs one interaction with the page first (browser rule).
  useEffect(() => {
    const prime = () => primeAudio();
    window.addEventListener("pointerdown", prime);
    window.addEventListener("keydown", prime);
    return () => { window.removeEventListener("pointerdown", prime); window.removeEventListener("keydown", prime); };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await adminApi.alerts.list();
      setItems(r.items);
      setUnread(r.unread);
      setPushKey(r.push?.vapidPublicKey ?? null);
      // A new unread SOS since the last check: banner and tone (not on the first load, so a reload stays quiet).
      const sosIds = r.items.filter((a) => a.kind === "sos.raised" && !a.readAt).map((a) => a.id);
      if (seen.current && sosIds.some((id) => !seen.current!.has(id))) {
        setNewSos(true);
        if (!mutedRef.current) playSosTone();
      }
      seen.current = new Set([...(seen.current ?? []), ...sosIds]);
    } catch { /* keep what's shown */ }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setItems(null); setUnread(0); seen.current = null; return; }
    refresh();
    const t = setInterval(refresh, ALERTS_POLL_MS);
    const onShow = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, [enabled, refresh]);

  const markRead = useCallback(async (ids?: string[]) => {
    if (!enabled) return;
    try {
      const r = await adminApi.alerts.markRead(ids);
      setUnread(r.unread);
      const now = new Date().toISOString();
      setItems((list) => list?.map((a) => (!a.readAt && (!ids || ids.includes(a.id)) ? { ...a, readAt: now } : a)) ?? null);
    } catch { /* try again on the next visit */ }
  }, [enabled]);

  // Opening a section marks its alerts seen; opening SOS alerts also clears the banner.
  useEffect(() => {
    if (!items) return;
    const section = Object.keys(SECTION_KINDS).find((s) => path === s || path.startsWith(`${s}/`));
    if (!section) return;
    if (section === "/sos") setNewSos(false);
    const ids = items.filter((a) => !a.readAt && SECTION_KINDS[section].includes(a.kind)).map((a) => a.id);
    if (ids.length) markRead(ids);
  }, [path, items, markRead]);

  // Browser push follows the session: back for the same staff member, dropped when the API ends the session.
  const adminId = admin?.id;
  useEffect(() => { if (adminId && enabled) resumePush(adminId); }, [adminId, enabled]);
  useEffect(() => {
    const onUnauthorized = () => { dropPush(); };
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const bySection = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [section, kinds] of Object.entries(SECTION_KINDS)) out[section] = items?.filter((a) => !a.readAt && kinds.includes(a.kind)).length ?? 0;
    return out;
  }, [items]);

  useTitleBadge(enabled ? unread : 0);

  const value = useMemo<AlertsState>(() => ({
    items, unread, bySection, newSos, dismissSos: () => setNewSos(false), muted, setMuted, pushKey, refresh, markRead, enabled,
  }), [items, unread, bySection, newSos, muted, setMuted, pushKey, refresh, markRead, enabled]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAlerts() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useAlerts must be used inside <AlertsProvider>");
  return s;
}

/** Signing out: take this browser off the account while the session is still valid. */
export const beforeSignOut = () => pausePush();

const PREFIX = /^\(\d+\+?\)\s/;
/** "(3) Dashboard · QuikFly Admin" while there are unread alerts; re-applied when a page sets its title. */
function useTitleBadge(count: number) {
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(PREFIX, "");
      const next = count > 0 ? `(${count > 9 ? "9+" : count}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); document.title = document.title.replace(PREFIX, ""); };
  }, [count]);
}
