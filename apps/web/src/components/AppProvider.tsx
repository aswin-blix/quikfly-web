"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Booking, CheckoutDraft, User } from "@quikfly/shared";
import { api, UNAUTHORIZED_EVENT } from "@/lib/api";
import { usePath } from "@/lib/nav";
import { dropPush, pausePush, resumePush } from "@/lib/push";
import { ConfigProvider } from "./ConfigProvider";

/** `href`: the toast is a link (e.g. a new notification opens the inbox). */
type Toast = { id: number; text: string; tone: "ok" | "err"; href?: string };

interface Ctx {
  user: User | null;
  setUser: (u: User | null) => void;
  /** Clears the signed-in user and ends the API session. */
  signOut: () => Promise<void>;
  /** Runs `fn` now if signed in, otherwise after the user signs in. */
  requireAuth: (fn: () => void) => void;
  loginOpen: boolean;
  closeLogin: (signedIn: boolean) => void;
  bookings: Booking[];
  refreshBookings: () => Promise<void>;
  /** Unread notifications (the bell's badge). */
  unread: number;
  /** Re-reads the unread count. `announce`: say so (a toast) when something new arrived. */
  refreshNotifications: (announce?: boolean) => Promise<void>;
  draft: CheckoutDraft | null;
  setDraft: (d: CheckoutDraft | null) => void;
  toast: (text: string, tone?: Toast["tone"], href?: string) => void;
  toasts: Toast[];
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

const USER_KEY = "quikfly.user";
/** How often the bell re-checks for notifications while the page is visible. */
const NOTIFICATIONS_POLL_MS = 60_000;
/** How long a toast stays; one with a link stays longer so there's time to tap it. */
const TOAST_MS = 3200;
const LINK_TOAST_MS = 6500;
const DRAFT_KEY = "quikfly.checkout";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraftState] = useState<CheckoutDraft | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pending = useRef<(() => void) | null>(null);
  const userRef = useRef<User | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) setUserState(JSON.parse(raw));
      const d = sessionStorage.getItem(DRAFT_KEY);
      // Drafts saved before prices came from the API have no quote: drop them.
      const parsed = d ? JSON.parse(d) : null;
      if (parsed?.quote) setDraftState(parsed);
    } catch { /* ignore */ }
  }, []);

  const setDraft = useCallback((d: CheckoutDraft | null) => {
    setDraftState(d);
    try {
      if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch { /* ignore */ }
  }, []);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    try {
      if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
      else localStorage.removeItem(USER_KEY);
    } catch { /* ignore */ }
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    // A parcel draft holds someone else's name and number.
    if (draft?.parcel) setDraft(null);
    // While the session is still valid: stop this account's notifications reaching this browser.
    await pausePush();
    await api.auth.signOut();
  }, [setUser, setDraft, draft]);

  // The API rejected the stored session (expired or revoked): sign out here too, and stop its notifications.
  useEffect(() => {
    const onUnauthorized = () => { setUser(null); dropPush(); };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [setUser]);

  // Bookings belong to a signed-in user, so only load them when there is one.
  // The user is reloaded too: booking or cancelling can change the wallet balance.
  const signedIn = !!user;
  const refreshBookings = useCallback(async () => {
    if (!signedIn) return setBookings([]);
    const [list, me] = await Promise.allSettled([api.bookings.list(), api.auth.me()]);
    if (list.status === "fulfilled") setBookings(list.value);
    // Skip if they signed out while the request was in flight.
    if (me.status === "fulfilled" && userRef.current) setUser(me.value);
  }, [signedIn, setUser]);
  useEffect(() => { refreshBookings(); }, [refreshBookings]);

  // The person who turned browser notifications on gets them back when they sign in (src/lib/push.ts).
  const userId = user?.id;
  useEffect(() => { if (userId) resumePush(userId); }, [userId]);

  const path = usePath();
  const pathRef = useRef(path);
  useEffect(() => { pathRef.current = path; }, [path]);
  const lastUnread = useRef<number | null>(null);
  const toastRef = useRef<Ctx["toast"]>(() => undefined);
  const refreshNotifications = useCallback(async (announce = false) => {
    if (!signedIn) { lastUnread.current = null; return setUnread(0); }
    try {
      const { items, unread: count } = await api.notifications.list();
      const before = lastUnread.current;
      lastUnread.current = count;
      setUnread(count);
      // Something new arrived while the page was open: say what, with a link (not on the inbox itself,
      // and not after the person's own booking, which its own screen already confirms).
      if (announce && before !== null && count > before && pathRef.current !== "/notifications") {
        const fresh = count - before;
        const newest = items.find((n) => !n.readAt);
        toastRef.current(fresh === 1 && newest ? newest.title : `${fresh} new notifications`, "ok", "/notifications");
      }
    } catch { /* keep the last count */ }
  }, [signedIn]);
  // Check on sign-in and after bookings change (quietly), every minute while the tab is visible, and
  // straight away when the tab comes back into view.
  useEffect(() => { refreshNotifications(); }, [refreshNotifications, bookings]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") refreshNotifications(true); }, NOTIFICATIONS_POLL_MS);
    const onShow = () => { if (document.visibilityState === "visible") refreshNotifications(true); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, [refreshNotifications]);

  const requireAuth = useCallback((fn: () => void) => {
    if (user) return fn();
    pending.current = fn;
    setLoginOpen(true);
  }, [user]);

  const closeLogin = useCallback((signedIn: boolean) => {
    setLoginOpen(false);
    const fn = pending.current;
    pending.current = null;
    if (signedIn && fn) setTimeout(fn, 50);
  }, []);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok", href?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone, href }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), href ? LINK_TOAST_MS : TOAST_MS);
  }, []);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  return (
    <AppCtx.Provider value={{
      user, setUser, signOut, requireAuth, loginOpen, closeLogin,
      bookings, refreshBookings, unread, refreshNotifications, draft, setDraft, toast, toasts,
    }}>
      <ConfigProvider>{children}</ConfigProvider>
    </AppCtx.Provider>
  );
}
