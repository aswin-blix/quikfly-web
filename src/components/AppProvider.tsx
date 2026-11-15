"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Booking, CheckoutDraft, User } from "@/lib/types";
import { api } from "@/lib/api";

type Toast = { id: number; text: string; tone: "ok" | "err" };

interface Ctx {
  user: User | null;
  setUser: (u: User | null) => void;
  /** Runs `fn` now if signed in, otherwise after the user signs in. */
  requireAuth: (fn: () => void) => void;
  loginOpen: boolean;
  closeLogin: (signedIn: boolean) => void;
  bookings: Booking[];
  refreshBookings: () => Promise<void>;
  draft: CheckoutDraft | null;
  setDraft: (d: CheckoutDraft | null) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  toasts: Toast[];
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

const USER_KEY = "quikfly.user";
const DRAFT_KEY = "quikfly.checkout";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [draft, setDraftState] = useState<CheckoutDraft | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) setUserState(JSON.parse(raw));
      const d = sessionStorage.getItem(DRAFT_KEY);
      if (d) setDraftState(JSON.parse(d));
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

  const refreshBookings = useCallback(async () => {
    setBookings(await api.bookings.list());
  }, []);
  useEffect(() => { refreshBookings(); }, [refreshBookings]);

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

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <AppCtx.Provider value={{
      user, setUser, requireAuth, loginOpen, closeLogin,
      bookings, refreshBookings, draft, setDraft, toast, toasts,
    }}>
      {children}
    </AppCtx.Provider>
  );
}
