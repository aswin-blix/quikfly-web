"use client";
// Page frame: sidebar on desktop, top bar + slide-in menu on phones. The login page renders bare.
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { ADMIN_ROLE_INFO } from "@quikfly/shared";
import { cx } from "@/lib/format";
import { LIVE_ROUTES, NAV, isActive } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { currentTheme, setTheme, type Theme } from "@/lib/theme";

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="QuikFly Admin home">
      {/* brand/quikfly-logo.svg, copied by scripts/logo.mjs; transparent, so it suits both themes */}
      <img src="/assets/logo.svg" alt="QuikFly" width={2059} height={495} className="h-8 w-auto" />
      <span className="text-[11px] uppercase tracking-widest text-subtle">Admin</span>
    </Link>
  );
}

function ThemeButton() {
  const [theme, setT] = useState<Theme | null>(null);
  useEffect(() => setT(currentTheme()), []);
  if (!theme) return <span className="size-9" />;
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button onClick={() => { setTheme(next); setT(next); }} aria-label={`Switch to ${next} mode`}
      className="size-9 grid place-items-center rounded-field text-muted hover:text-fg hover:bg-raised">
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const search = useSearchParams().toString();
  const full = search ? `${path}?${search}` : path;
  const { can } = useSession();
  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-0.5">
      {NAV.filter((n) => LIVE_ROUTES.has(n.href) && can(n.permission)).map((n) => {
        const active = isActive(n.href, path, full);
        return (
          <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={cx("flex items-center gap-3 px-3 py-2 rounded-field text-sm transition-colors",
              active ? "bg-nav-active text-strong font-semibold" : "text-muted hover:text-fg hover:bg-raised")}>
            <n.icon size={18} className={active ? "text-accent" : undefined} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountFooter() {
  const { admin, logout } = useSession();
  if (!admin) return null;
  return (
    <div className="border-t border-line pt-3 mt-3">
      <p className="text-sm font-medium text-fg truncate">{admin.name}</p>
      <p className="text-xs text-subtle truncate">{admin.email} · {ADMIN_ROLE_INFO[admin.role].label}{admin.counter ? `, ${admin.counter.city}` : ""}</p>
      <div className="flex items-center justify-between mt-2">
        <button onClick={logout} className="inline-flex items-center gap-2 text-sm text-muted hover:text-danger py-1.5">
          <LogOut size={16} /> Sign out
        </button>
        <ThemeButton />
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { admin } = useSession();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (path === "/login" || !admin) return <main className="min-h-dvh">{children}</main>;

  return (
    <div className="min-h-dvh lg:pl-(--sidebar-width)">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-(--sidebar-width) flex-col border-r border-line bg-surface px-3 py-4">
        <div className="px-3 pb-5"><Wordmark /></div>
        <div className="flex-1 overflow-y-auto"><Suspense><NavList /></Suspense></div>
        <AccountFooter />
      </aside>

      {/* Phone top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 backdrop-blur px-4 h-14">
        <button onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="size-9 -ml-1.5 grid place-items-center rounded-field hover:bg-raised">
          <Menu size={20} />
        </button>
        <Wordmark />
        <ThemeButton />
      </header>

      {open && (
        <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-overlay" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface border-r border-line flex flex-col px-3 py-4">
            <div className="flex items-center justify-between px-3 pb-5">
              <Wordmark />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="size-9 grid place-items-center rounded-field hover:bg-raised"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto"><Suspense><NavList onNavigate={() => setOpen(false)} /></Suspense></div>
            <AccountFooter />
          </div>
        </div>
      )}

      <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8 max-w-7xl">{children}</main>
    </div>
  );
}
