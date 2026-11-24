"use client";
// Staff alerts across the panel: one poll of GET /admin/alerts feeds the bell and its menu, the sidebar
// counts, the pop-ups, the SOS banner, the sounds and the tab title. Anything new since the last check
// is announced: a pop-up (an SOS gets its banner instead), a sound, a system notification when the tab
// is in the background, and the page it belongs to reloads its list (useAlertReload). Opening a section
// (e.g. Support) marks its alerts seen, but only while the tab is on screen, so nothing is "read"
// unseen. Only roles with `alerts.view` (owner, operations) have alerts; others see none of this.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { StaffAlert, StaffAlertKind } from "@quikfly/shared";
import { isUrgent } from "./alert-kinds";
import { adminApi, ADMIN_UNAUTHORIZED_EVENT } from "./api";
import { dropPush, pausePush, resumePush } from "./push";
import { useSession } from "./session";
import { playChime, playSosTone, primeAudio } from "./tone";

/** How often the panel checks for new alerts (browsers slow this down in background tabs). */
export const ALERTS_POLL_MS = 15_000;
/** At most this many pop-ups at once; a bigger batch becomes one "N new alerts" pop-up. */
export const MAX_POPUPS = 3;
/** Per-viewer choice to silence alert sounds (this browser only; the key predates the chime). */
const MUTE_KEY = "quikfly.admin.sosMute";
/**
 * The newest alert this tab has shown, per staff member (`<adminId> <createdAt>`), kept for the browser
 * session: after a reload only what arrived since is announced, and a new session gets one
 * "N unread alerts" reminder instead.
 */
const SEEN_UP_TO_KEY = "quikfly.admin.alerts.seenUpTo";
const NOTIFY_ICON = "/assets/notify-icon.png";

/** Which page an alert belongs to: opening it marks those alerts seen, and its sidebar entry shows the count. */
export const SECTION_KINDS: Record<string, StaffAlertKind[]> = {
  "/sos": ["sos.raised"],
  "/support": ["support.ticket", "support.reply", "support.callback"],
  "/vendors": ["vendor.applied", "vendor.fleet", "vendor.payout"],
  "/licences": ["licence.submitted"],
  "/parcels": ["parcel.unclaimed"],
};
const sectionOf = (kind: StaffAlertKind) => Object.keys(SECTION_KINDS).find((s) => SECTION_KINDS[s].includes(kind));

/** A pop-up: one alert, or a summary of several (kind null). */
export interface AlertPopup { key: string; kind: StaffAlertKind | null; title: string; body: string; link: string; alertIds: string[] }

interface AlertsState {
  items: StaffAlert[] | null;
  unread: number;
  /** Unread alerts per sidebar section (keys of SECTION_KINDS). */
  bySection: Record<string, number>;
  /** Bumped when a new alert for that section arrives, so its page reloads (useAlertReload). */
  versions: Record<string, number>;
  popups: AlertPopup[];
  dismissPopup: (key: string) => void;
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

const readStore = (key: string, store: () => Storage) => { try { return store().getItem(key); } catch { return null; } };
const writeStore = (key: string, value: string | null, store: () => Storage) => {
  try { if (value === null) store().removeItem(key); else store().setItem(key, value); } catch { /* this visit only */ }
};
const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

/** One alert per pop-up, or one summary when a batch is bigger than MAX_POPUPS. */
function popupsFor(fresh: StaffAlert[]): AlertPopup[] {
  if (fresh.length <= MAX_POPUPS) return fresh.map((a) => ({ key: a.id, kind: a.kind, title: a.title, body: a.body, link: a.link, alertIds: [a.id] }));
  return [{ key: `batch:${fresh[0].id}`, kind: null, title: `${fresh.length} new alerts`, body: fresh.slice(0, 2).map((a) => a.title).join(" · ") + " and more.", link: "/alerts", alertIds: fresh.map((a) => a.id) }];
}

/**
 * A system notification while the panel is in a background tab (needs the browser's permission, which
 * "Browser alerts" asks for). Tagged with the alert id like the API's push (public/sw.js), so the push
 * that follows replaces it instead of showing it twice.
 */
async function notifySystem(fresh: StaffAlert[], go: (link: string) => void) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker?.getRegistration("/sw.js").catch(() => undefined);
  for (const a of fresh.slice(0, MAX_POPUPS)) {
    const options: NotificationOptions = { body: a.body, icon: NOTIFY_ICON, tag: a.id, requireInteraction: isUrgent(a.kind), data: { url: a.link } };
    try {
      if (reg) await reg.showNotification(a.title, options); // the service worker opens the page on a click
      else {
        const n = new Notification(a.title, options);
        n.onclick = () => { window.focus(); go(a.link); n.close(); };
      }
    } catch { /* this browser can't from a page: the pop-up waits for the staff member */ }
  }
}

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { admin, can } = useSession();
  const enabled = !!admin && can("alerts.view");
  const path = usePathname();
  const router = useRouter();
  const [items, setItems] = useState<StaffAlert[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [newSos, setNewSos] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [popups, setPopups] = useState<AlertPopup[]>([]);
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [visible, setVisible] = useState(true);
  const seen = useRef<Set<string> | null>(null);
  const mutedRef = useRef(false);

  useEffect(() => {
    const m = readStore(MUTE_KEY, () => localStorage) === "1";
    setMutedState(m);
    mutedRef.current = m;
  }, []);
  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    mutedRef.current = m;
    writeStore(MUTE_KEY, m ? "1" : null, () => localStorage);
  }, []);

  // Sound needs one interaction with the page first (browser rule).
  useEffect(() => {
    const prime = () => primeAudio();
    window.addEventListener("pointerdown", prime);
    window.addEventListener("keydown", prime);
    return () => { window.removeEventListener("pointerdown", prime); window.removeEventListener("keydown", prime); };
  }, []);

  const addPopups = useCallback((next: AlertPopup[]) => {
    if (!next.length) return;
    // Newest first; an alert already on screen isn't shown twice; the oldest go when there are too many.
    setPopups((list) => [...next, ...list.filter((p) => !next.some((n) => n.key === p.key))].slice(0, MAX_POPUPS + 1));
  }, []);
  const dismissPopup = useCallback((key: string) => setPopups((list) => list.filter((p) => p.key !== key)), []);

  /** Something new arrived: pop-ups, the SOS banner, a sound, the section reloads, a system notification if hidden. */
  const announce = useCallback((fresh: StaffAlert[]) => {
    const sos = fresh.filter((a) => isUrgent(a.kind));
    const rest = fresh.filter((a) => !isUrgent(a.kind));
    if (sos.length) setNewSos(true);
    addPopups(popupsFor(rest));
    setVersions((v) => {
      const out = { ...v };
      for (const a of fresh) { const s = sectionOf(a.kind); if (s) out[s] = (out[s] ?? 0) + 1; }
      return out;
    });
    if (!mutedRef.current) (sos.length ? playSosTone : playChime)();
    if (!isVisible()) void notifySystem(fresh, (link) => router.push(link));
  }, [addPopups, router]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await adminApi.alerts.list();
      setItems(r.items);
      setUnread(r.unread);
      setPushKey(r.push?.vapidPublicKey ?? null);
      const waiting = r.items.filter((a) => !a.readAt);
      if (seen.current) {
        const fresh = waiting.filter((a) => !seen.current!.has(a.id));
        if (fresh.length) announce(fresh);
      } else if (admin) {
        const [who, upTo] = (readStore(SEEN_UP_TO_KEY, () => sessionStorage) ?? "").split(" ");
        if (who === admin.id && upTo) {
          // Reloaded in this session: announce only what arrived since this tab last looked.
          const fresh = waiting.filter((a) => a.createdAt > upTo);
          if (fresh.length) announce(fresh);
        } else if (r.unread > 0) {
          // A new session: one quiet reminder of what's waiting (no sound).
          const sos = waiting.some((a) => isUrgent(a.kind));
          addPopups([{ key: "waiting", kind: null, title: r.unread === 1 ? "1 unread alert" : `${r.unread} unread alerts`,
            body: sos ? "Including an SOS. Have a look before anything else." : "Waiting since you were last here.", link: "/alerts", alertIds: [] }]);
        }
      }
      seen.current = new Set([...(seen.current ?? []), ...r.items.map((a) => a.id)]);
      if (admin) {
        const newest = r.items.reduce((m, a) => (a.createdAt > m ? a.createdAt : m), "");
        if (newest) writeStore(SEEN_UP_TO_KEY, `${admin.id} ${newest}`, () => sessionStorage);
      }
    } catch { /* keep what's shown */ }
  }, [enabled, admin, announce, addPopups]);

  useEffect(() => {
    if (!enabled) { setItems(null); setUnread(0); setPopups([]); seen.current = null; return; }
    refresh();
    const t = setInterval(refresh, ALERTS_POLL_MS);
    const onShow = () => {
      setVisible(isVisible());
      if (isVisible()) refresh();
    };
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

  // Opening a section marks its alerts seen (only while the tab is on screen); opening SOS alerts also clears the banner.
  useEffect(() => {
    if (!items || !visible) return;
    const section = Object.keys(SECTION_KINDS).find((s) => path === s || path.startsWith(`${s}/`));
    if (!section) return;
    if (section === "/sos") setNewSos(false);
    const ids = items.filter((a) => !a.readAt && SECTION_KINDS[section].includes(a.kind)).map((a) => a.id);
    if (ids.length) markRead(ids);
  }, [path, items, visible, markRead]);

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
    items, unread, bySection, versions, popups, dismissPopup, newSos, dismissSos: () => setNewSos(false), muted, setMuted, pushKey, refresh, markRead, enabled,
  }), [items, unread, bySection, versions, popups, dismissPopup, newSos, muted, setMuted, pushKey, refresh, markRead, enabled]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAlerts() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useAlerts must be used inside <AlertsProvider>");
  return s;
}

/** Reloads a page's list when a new alert for its section arrives (e.g. a ticket while Support is open). */
export function useAlertReload(section: keyof typeof SECTION_KINDS, reload: () => unknown) {
  const { versions } = useAlerts();
  const version = versions[section] ?? 0;
  const last = useRef(version);
  useEffect(() => {
    if (version === last.current) return;
    last.current = version;
    reload();
  }, [version, reload]);
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
