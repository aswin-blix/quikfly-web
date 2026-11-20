"use client";
// Start-up data from the API (GET /config): business settings and the small catalog lists
// (places, ride types, cities, routes, destinations, offers, FAQs). Loaded on each visit and
// again when the tab comes back into view (at most every CONFIG_REFRESH_MS), so a page left
// open picks up admin price changes, like the app does on resume. Screens read it with
// useConfig() / useSettings().
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, type AppConfig, type Settings } from "@quikfly/shared";
import { api } from "@/lib/api";

/** A tab coming back into view reloads /config if it is older than this (the API caches settings 30 s). */
const CONFIG_REFRESH_MS = 60_000;

interface ConfigState {
  config: AppConfig | null;
  error: string;
  retry: () => void;
}

const Ctx = createContext<ConfigState>({ config: null, error: "", retry: () => {} });

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState("");
  const loadedAt = useRef(0);
  const load = useCallback(() => {
    setError("");
    api.config.get().then((c) => { loadedAt.current = Date.now(); setConfig(c); })
      .catch((e: Error) => setError(e.message || "Couldn't load QuikFly. Check your connection."));
  }, []);
  useEffect(load, [load]);
  // Refresh quietly when the tab is shown again; a failed refresh keeps the config already shown.
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== "visible" || !loadedAt.current || Date.now() - loadedAt.current < CONFIG_REFRESH_MS) return;
      api.config.get().then((c) => { loadedAt.current = Date.now(); setConfig(c); }).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);
  return <Ctx.Provider value={{ config, error, retry: load }}>{children}</Ctx.Provider>;
}

/** The start-up config, or null while it loads. Show a skeleton for null. */
export const useConfig = () => useContext(Ctx).config;
export const useConfigState = () => useContext(Ctx);

/**
 * Business settings. Until /config arrives this returns the defaults, which is fine for
 * hints and labels; prices the customer pays always come from an API quote.
 */
export const useSettings = (): Settings => useContext(Ctx).config?.settings ?? DEFAULT_SETTINGS;
