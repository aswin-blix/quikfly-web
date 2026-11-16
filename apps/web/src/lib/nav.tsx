"use client";
/**
 * Navigation layer. Normal build: real Next.js App Router routes.
 * SPA build (NEXT_PUBLIC_SPA=1): an in-memory router so the whole site can be
 * bundled into one HTML file for the shareable demo link. Screens only use the
 * helpers below, never next/navigation directly.
 */
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { SPA } from "./spa-flag";
export { SPA };

interface SpaState { href: string; push: (h: string) => void; back: () => void; replace: (h: string) => void }
const SpaCtx = createContext<SpaState | null>(null);

export function SpaNavProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<string[]>(["/"]);
  const push = useCallback((h: string) => {
    setStack((s) => [...s, h]);
    window.scrollTo({ top: 0 });
  }, []);
  const replace = useCallback((h: string) => setStack((s) => [...s.slice(0, -1), h]), []);
  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    window.scrollTo({ top: 0 });
  }, []);
  const value = useMemo(() => ({ href: stack[stack.length - 1], push, back, replace }), [stack, push, back, replace]);
  return <SpaCtx.Provider value={value}>{children}</SpaCtx.Provider>;
}

// Fallback lets the unused per-route pages prerender during the SPA build.
const FALLBACK: SpaState = { href: "/", push: () => {}, back: () => {}, replace: () => {} };
const useSpa = () => useContext(SpaCtx) ?? FALLBACK;

/* eslint-disable react-hooks/rules-of-hooks -- SPA is a build-time constant */
export function usePath(): string {
  if (SPA) return useSpa().href.split("?")[0];
  return usePathname();
}

/** Query string params. In the Next build, wrap the caller in <Suspense>. */
export function useQuery(): URLSearchParams {
  if (SPA) return new URLSearchParams(useSpa().href.split("?")[1] ?? "");
  const sp = useSearchParams();
  return useMemo(() => new URLSearchParams(sp.toString()), [sp]);
}

export function useNav() {
  if (SPA) {
    const s = useSpa();
    return { push: s.push, replace: s.replace, back: s.back };
  }
  const r = useRouter();
  return useMemo(() => ({ push: (h: string) => r.push(h), replace: (h: string) => r.replace(h), back: () => r.back() }), [r]);
}

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

export function Link({ href, onClick, children, ...rest }: LinkProps) {
  if (SPA) {
    const s = useSpa();
    return (
      <a {...rest} href={href} onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) { e.preventDefault(); s.push(href); } }}>
        {children}
      </a>
    );
  }
  return <NextLink href={href} onClick={onClick} {...rest}>{children}</NextLink>;
}
/* eslint-enable react-hooks/rules-of-hooks */

export const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== undefined && v !== "" && p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : "";
};
