"use client";
// Team (owners only): staff accounts. Create one (the password is shown once), change a role,
// reset a password, disable or enable. You can't change or disable your own account here.
import { useState } from "react";
import { Copy, KeyRound, UserPlus, UsersRound } from "lucide-react";
import { ADMIN_ROLES, ADMIN_ROLE_INFO, LIMITS, type AdminRole, type TeamMember } from "@quikfly/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge, Button, Empty, ErrorBox, Field, PageHeader } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { cx, dateTime, timeAgo } from "@/lib/format";
import { RequireAdmin, useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

/** A password shown once, with a copy button. It is never shown again; a reset makes a new one. */
function OneTimePassword({ email, password, onDismiss }: { email: string; password: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card p-4 border-brand/40 bg-brand/5 grid gap-2" role="status">
      <p className="text-sm text-strong font-semibold">Password for {email} (shown once)</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-base font-mono bg-surface border border-line rounded-field px-3 py-1.5 select-all">{password}</code>
        <Button size="sm" onClick={async () => { try { await navigator.clipboard.writeText(password); setCopied(true); } catch { /* the code is selectable */ } }}><Copy size={14} /> {copied ? "Copied" : "Copy"}</Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>Done, I&apos;ve passed it on</Button>
      </div>
      <p className="text-xs text-subtle">Share it in person or over a call, not by email. They should change nothing else: there is no self-service password change yet, so a forgotten password means a reset here.</p>
    </div>
  );
}

function Team() {
  const { admin } = useSession();
  const { data, setData, error, loading, reload } = useLoad(() => adminApi.team.list(), []);
  const [form, setForm] = useState({ name: "", email: "", role: "operations" as AdminRole });
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [confirm, setConfirm] = useState<{ member: TeamMember; kind: "disable" | "enable" | "reset" } | null>(null);

  const replace = (m: TeamMember) => setData((list) => list?.map((x) => (x.id === m.id ? m : x)) ?? null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("create"); setFormError("");
    try {
      const r = await adminApi.team.create({ name: form.name.trim(), email: form.email.trim(), role: form.role });
      setData((list) => [...(list ?? []), r.member]);
      setSecret({ email: r.member.email, password: r.password });
      setForm({ name: "", email: "", role: "operations" });
    } catch (err) { setFormError(err instanceof Error ? err.message : "Couldn't create the account."); }
    finally { setBusy(null); }
  };

  const changeRole = async (m: TeamMember, role: AdminRole) => {
    setBusy(m.id); setActionError("");
    try { replace(await adminApi.team.update(m.id, { role })); }
    catch (err) { setActionError(err instanceof Error ? err.message : "Couldn't change the role."); }
    finally { setBusy(null); }
  };

  const run = async () => {
    if (!confirm) return;
    const { member: m, kind } = confirm;
    setBusy(m.id); setActionError("");
    try {
      if (kind === "reset") { const r = await adminApi.team.resetPassword(m.id); replace(r.member); setSecret({ email: m.email, password: r.password }); }
      else replace(await adminApi.team.update(m.id, { disabled: kind === "disable" }));
      setConfirm(null);
    } catch (err) { setActionError(err instanceof Error ? err.message : "Couldn't update the account."); }
    finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title="Team" sub="Who can sign in to this panel and what each role may do. Changes end the person's sessions and are written to the audit log." />
      {secret && <div className="mb-4"><OneTimePassword email={secret.email} password={secret.password} onDismiss={() => setSecret(null)} /></div>}
      {actionError && <ErrorBox message={actionError} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <section className="card overflow-hidden lg:col-span-2" aria-labelledby="members">
          <h2 id="members" className="font-semibold text-strong px-4 pt-4 pb-2">Staff accounts</h2>
          {error && <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div>}
          {!data && !error && <div className="p-4 grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12" />)}</div>}
          {data && (data.length === 0 ? <Empty icon={UsersRound} title="No staff accounts" /> : (
            <ul className={cx("divide-y divide-line", loading && "opacity-60")}>
              {data.map((m) => {
                const me = m.id === admin?.id;
                const state = m.disabledAt ? { label: "Disabled", cls: "bg-raised text-subtle" } : m.lockedUntil ? { label: "Locked out", cls: "bg-warning/10 text-warning" } : { label: "Active", cls: "bg-success/10 text-success" };
                return (
                  <li key={m.id} className="px-4 py-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="font-medium text-strong truncate">{m.name}{me && <span className="ml-2 text-[11px] font-normal text-accent">you</span>}</p>
                      <p className="text-xs text-muted truncate">{m.email} · {m.lastLoginAt ? `last signed in ${timeAgo(m.lastLoginAt)}` : "never signed in"} · added {dateTime(m.createdAt).split(",")[0]}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge className={state.cls}>{state.label}</Badge>
                      <select className="field !w-auto !py-1.5 text-sm" value={m.role} aria-label={`Role of ${m.name}`} disabled={me || !!busy || !!m.disabledAt} onChange={(e) => changeRole(m, e.target.value as AdminRole)}>
                        {ADMIN_ROLES.map((r) => <option key={r} value={r}>{ADMIN_ROLE_INFO[r].label}</option>)}
                      </select>
                      <Button size="sm" disabled={!!busy || !!m.disabledAt} onClick={() => setConfirm({ member: m, kind: "reset" })}><KeyRound size={14} /> Reset password</Button>
                      {!me && (m.disabledAt
                        ? <Button size="sm" variant="primary" disabled={!!busy} onClick={() => setConfirm({ member: m, kind: "enable" })}>Enable</Button>
                        : <Button size="sm" variant="danger" disabled={!!busy} onClick={() => setConfirm({ member: m, kind: "disable" })}>Disable</Button>)}
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}
          <div className="px-4 py-3 border-t border-line text-xs text-subtle grid gap-1">
            {ADMIN_ROLES.map((r) => <p key={r}><span className="text-fg font-medium">{ADMIN_ROLE_INFO[r].label}:</span> {ADMIN_ROLE_INFO[r].summary}</p>)}
          </div>
        </section>

        <form className="card p-5 grid gap-3 content-start" onSubmit={create} aria-labelledby="add">
          <h2 id="add" className="font-semibold text-strong flex items-center gap-2"><UserPlus size={18} /> Add a staff member</h2>
          <Field label="Name" htmlFor="tm-name"><input id="tm-name" className="field" required minLength={LIMITS.nameMin} maxLength={LIMITS.nameMax} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Work email (their sign-in)" htmlFor="tm-email"><input id="tm-email" className="field" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Role" htmlFor="tm-role" hint={ADMIN_ROLE_INFO[form.role].summary}>
            <select id="tm-role" className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}>
              {ADMIN_ROLES.map((r) => <option key={r} value={r}>{ADMIN_ROLE_INFO[r].label}</option>)}
            </select>
          </Field>
          {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
          <Button type="submit" variant="primary" loading={busy === "create"} disabled={!!busy}>Create account</Button>
          <p className="text-xs text-subtle">A password is generated and shown once, here.</p>
        </form>
      </div>

      <ConfirmDialog open={!!confirm} busy={!!busy} onCancel={() => setConfirm(null)} onConfirm={run}
        title={confirm?.kind === "reset" ? "Reset this password?" : confirm?.kind === "disable" ? "Disable this account?" : "Enable this account?"}
        confirmLabel={confirm?.kind === "reset" ? "Reset password" : confirm?.kind === "disable" ? "Disable" : "Enable"} danger={confirm?.kind === "disable"}>
        {confirm?.kind === "reset" && <p>{confirm.member.name} gets a new password (shown once) and is signed out everywhere. Any lockout is cleared.</p>}
        {confirm?.kind === "disable" && <p>{confirm.member.name} is signed out now and can&apos;t sign in until enabled again. Their past actions stay in the audit log.</p>}
        {confirm?.kind === "enable" && <p>{confirm.member.name} can sign in again with their current password (reset it if they&apos;ve forgotten it).</p>}
      </ConfirmDialog>
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="team.manage"><Team /></RequireAdmin>;
}
