"use client";
// Start-up data from the API (GET /config): business settings and the small catalog lists
// (places, ride types, cities, routes, destinations, offers, FAQs). Loaded once per visit;
// admin edits show on the next page load. Screens read it with useConfig() / useSettings().
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type AppConfig, type Settings } from "@quikfly/shared";
import { api } from "@/lib/api";

interface ConfigState {
  config: AppConfig | null;
  error: string;
  retry: () => void;
}

const Ctx = createContext<ConfigState>({ config: null, error: "", retry: () => {} });

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api.config.get().then(setConfig).catch((e: Error) => setError(e.message || "Couldn't load QuikFly. Check your connection."));
  }, []);
  useEffect(load, [load]);
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
