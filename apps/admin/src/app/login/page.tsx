"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button, Field, PasswordInput } from "@/components/ui";
import { useSession } from "@/lib/session";

function LoginForm() {
  const { admin, loading, login } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  // Only same-site paths, so a crafted link can't bounce staff to another site after sign-in.
  const next = params.get("next")?.startsWith("/") && !params.get("next")?.startsWith("//") ? params.get("next")! : "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && admin) router.replace(next); }, [loading, admin, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true); setError("");
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Logo imgClassName="h-14 w-auto" />
          <p className="text-sm text-muted mt-2">Admin · staff sign-in</p>
        </div>
        <form onSubmit={submit} className="card p-6 grid gap-4" noValidate>
          <Field label="Work email" htmlFor="email">
            <input id="email" type="email" autoComplete="username" className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Password" htmlFor="password">
            <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <Button variant="primary" loading={busy} className="w-full py-2.5"><Lock size={16} /> Sign in</Button>
        </form>
        <p className="text-xs text-subtle text-center mt-4">Forgot your password? Ask an owner to reset it.</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
