"use client";
// Who is signed in to the admin panel. Pages wrap their content in <RequireAdmin>.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { can, type AdminUser, type Permission } from "@quikfly/shared";
import { ADMIN_UNAUTHORIZED_EVENT, adminApi, getToken } from "./api";

interface Session {
  admin: AdminUser | null;
  /** True until the stored token has been checked. */
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  can(permission: Permission): boolean;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    adminApi.auth.me().then(setAdmin).catch(() => setAdmin(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setAdmin(null);
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => { setAdmin(await adminApi.auth.login(email, password)); }, []);
  const logout = useCallback(async () => { await adminApi.auth.logout(); setAdmin(null); }, []);
  const check = useCallback((p: Permission) => !!admin && can(admin.role, p), [admin]);

  return <Ctx.Provider value={{ admin, loading, login, logout, can: check }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession must be used inside <SessionProvider>");
  return s;
}

/** Shows children only to a signed-in admin with the permission; otherwise sends them to /login. */
export function RequireAdmin({ permission, children }: { permission?: Permission; children: React.ReactNode }) {
  const { admin, loading, can: allowed } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !admin) router.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }, [loading, admin, router]);

  if (loading || !admin) {
    return <div className="grid place-items-center min-h-[50vh]" role="status" aria-label="Loading"><span className="size-6 rounded-full border-2 border-accent border-r-transparent animate-spin" /></div>;
  }
  if (permission && !allowed(permission)) {
    return (
      <div className="card p-8 text-center max-w-md mx-auto mt-10">
        <p className="font-semibold text-strong">You don&apos;t have access to this page</p>
        <p className="text-sm text-muted mt-1">Your role can&apos;t open it. Ask an owner if you need it.</p>
      </div>
    );
  }
  return <>{children}</>;
}
