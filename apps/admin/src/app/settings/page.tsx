"use client";
// Settings: tabs by area, search across all of them, a "changed from default" badge with a reset,
// each setting's history from the audit log (with "Restore"), row editors for surge hours and
// cancellation tiers, a "Try a fare" panel, and a review of every change before it's saved.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, History, RotateCcw, Search, X } from "lucide-react";
import { DEFAULT_SETTINGS, SETTING_RULES, checkSetting, checkSettings, isTermKey, type AuditEntry, type Settings } from "@quikfly/shared";
import { SettingsFarePreview } from "@/components/FarePreview";
import { CancelTiersEditor, POLICY_SERVICE, SurgeHoursEditor } from "@/components/SettingEditors";
import { Badge, Button, ErrorBox, PageHeader, Toggle } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { cx, dateTime } from "@/lib/format";
import { RequireAdmin, useSession } from "@/lib/session";
import { SETTING_FIELDS, SETTING_GROUPS, SETTING_TABS, fieldLabel, type SettingField, type SettingGroup } from "@/lib/settings-fields";
import { useLoad } from "@/lib/useLoad";

type Key = keyof Settings;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A value as staff read it: "On", "₹500", "1.2 ×", "(empty)". */
function showValue(f: SettingField | undefined, v: unknown): string {
  if (f?.type === "toggle" || typeof v === "boolean") return v ? "On" : "Off";
  if (v === "" || v === null || v === undefined) return "(empty)";
  if (typeof v === "number") return f?.unit === "₹" ? `₹${v.toLocaleString("en-IN")}` : f?.unit ? `${v} ${f.unit}` : String(v);
  return `“${String(v)}”`;
}
const fieldOf = (key: string) => SETTING_FIELDS.find((f) => f.key === key);

function FieldInput({ f, value, onChange, disabled }: { f: SettingField; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  const id = `set-${f.key}`;
  if (f.type === "toggle") return <Toggle label={f.label} checked={!!value} onChange={onChange} disabled={disabled} />;
  if (f.editor === "hours") return <SurgeHoursEditor id={id} value={String(value ?? "")} onChange={onChange} disabled={disabled} />;
  if (f.editor === "tiers") return <CancelTiersEditor id={id} value={String(value ?? "")} onChange={onChange} disabled={disabled} service={POLICY_SERVICE[f.key]} />;
  const rule = SETTING_RULES[f.key];
  const limits = rule.type === "number" ? { min: rule.min, max: rule.max, step: f.step ?? (rule.integer ? 1 : "any") } : rule.type === "text" ? { maxLength: rule.max } : {};
  return (
    <div className="flex items-center gap-2 w-full sm:w-48">
      {f.unit === "₹" && <span className="text-muted">₹</span>}
      <input
        id={id} className="field" disabled={disabled}
        type={f.type === "number" ? "number" : "text"} {...limits}
        value={String(value ?? "")}
        onChange={(e) => onChange(f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
      />
      {f.unit && f.unit !== "₹" && <span className="text-muted text-sm">{f.unit}</span>}
    </div>
  );
}

/** A modal sheet (a bottom sheet on phones). Escape or the backdrop closes it. */
function Modal({ open, title, onClose, children, footer, busy }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; busy?: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="absolute inset-0 bg-overlay" onClick={() => !busy && onClose()} />
      <div className="relative card w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-b-none sm:rounded-b-[var(--card-radius)]">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 border-b border-line">
          <h2 id="modal-title" className="font-semibold text-strong text-lg">{title}</h2>
          <button ref={closeRef} type="button" className="p-1.5 rounded-md text-muted hover:text-fg" aria-label="Close" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">{footer}</div>}
      </div>
    </div>
  );
}

/** One setting's changes from the audit log, newest first, each with "Restore" for the value before it. */
function HistoryList({ settingKey, onRestore, canRestore }: { settingKey: Key; onRestore: (v: unknown) => void; canRestore: boolean }) {
  const { data, error, reload } = useLoad(() => adminApi.audit(1, "settings", settingKey), [settingKey]);
  const f = fieldOf(settingKey);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <div className="grid gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10" />)}</div>;
  if (!data.items.length) return <p className="text-sm text-muted">No changes recorded: it still has the default value ({showValue(f, DEFAULT_SETTINGS[settingKey])}), or it was set before the audit log existed.</p>;
  const detail = (e: AuditEntry) => e.detail as { before?: Record<string, unknown>; after?: Record<string, unknown> };
  return (
    <>
      <ol className="grid gap-3">
        {data.items.map((e) => {
          const { before, after } = detail(e);
          const was = before?.[settingKey];
          return (
            <li key={e.id} className="rounded-lg border border-line p-3 text-sm">
              <p className="text-xs text-subtle">{dateTime(e.createdAt)} · {e.admin?.name ?? "Script"}</p>
              <p className="mt-1 text-fg break-words"><span className="text-muted">{showValue(f, was)}</span> → <span className="font-medium">{showValue(f, after?.[settingKey])}</span></p>
              {canRestore && was !== undefined && (
                <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={() => onRestore(was)}><RotateCcw size={14} /> Restore {showValue(f, was)}</Button>
              )}
            </li>
          );
        })}
      </ol>
      {data.total > data.items.length && <p className="text-xs text-subtle mt-3">Older changes are in the Audit log.</p>}
      {canRestore && <p className="text-xs text-subtle mt-3">Restoring puts the value in your unsaved changes; review and save to apply it.</p>}
    </>
  );
}

interface RowProps {
  draft: Settings; data: Settings; editable: boolean; canHistory: boolean;
  onChange: (k: Key, v: unknown) => void; onHistory: (k: Key) => void;
}

function SettingRow({ f, draft, data, editable, canHistory, onChange, onHistory }: RowProps & { f: SettingField }) {
  const value = draft[f.key];
  const unsaved = !same(value, data[f.key]);
  const fromDefault = !same(value, DEFAULT_SETTINGS[f.key]);
  return (
    <div className={cx("px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6 border-l-2", unsaved ? "border-l-accent bg-raised/40" : "border-l-transparent")}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`set-${f.key}`} className="text-sm font-medium text-fg">{f.label}</label>
          {unsaved && <Badge className="bg-accent/15 text-strong">Unsaved</Badge>}
          {fromDefault && <Badge className="bg-raised text-muted">Changed from default</Badge>}
        </div>
        {f.help && <p className="text-xs text-subtle mt-0.5">{f.help}</p>}
        {isTermKey(f.key) && <p className="text-xs text-muted mt-0.5">Kept with each booking: changes apply to new bookings only.</p>}
        {(fromDefault || canHistory) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
            {fromDefault && <span className="text-subtle">Default: {showValue(f, DEFAULT_SETTINGS[f.key])}</span>}
            {fromDefault && editable && (
              <button type="button" className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => onChange(f.key, DEFAULT_SETTINGS[f.key])}>
                <RotateCcw size={12} /> Reset to default
              </button>
            )}
            {canHistory && (
              <button type="button" className="inline-flex items-center gap-1 text-muted hover:text-fg" onClick={() => onHistory(f.key)} aria-label={`History of ${f.label}`}>
                <History size={12} /> History
              </button>
            )}
          </div>
        )}
      </div>
      <FieldInput f={f} value={value} disabled={!editable} onChange={(v) => onChange(f.key, v)} />
    </div>
  );
}

function GroupCard({ g, fields, row }: { g: SettingGroup; fields: SettingField[]; row: RowProps }) {
  return (
    <section className="card" aria-labelledby={`g-${g.title}`}>
      <div className="px-5 pt-5 pb-3 border-b border-line">
        <h2 id={`g-${g.title}`} className="font-semibold text-strong">{g.title}</h2>
        <p className="text-sm text-muted mt-0.5">{g.sub}</p>
      </div>
      <div className="divide-y divide-line">
        {fields.map((f) => <SettingRow key={f.key} f={f} {...row} />)}
      </div>
    </section>
  );
}

function SettingsForm() {
  const { can } = useSession();
  const editable = can("settings.edit");
  const canHistory = can("audit.view");
  const { data, setData, error, reload } = useLoad(() => adminApi.settings.get(), []);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [tab, setTab] = useState(SETTING_TABS[0].id);
  const [query, setQuery] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [historyKey, setHistoryKey] = useState<Key | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (data) setDraft(data); }, [data]);

  const changed = useMemo(() => (data && draft ? (Object.keys(draft) as Key[]).filter((k) => !same(draft[k], data[k])) : []), [data, draft]);
  const change = (k: Key, v: unknown) => { setSaved(false); setSaveError(""); setDraft((d) => (d ? ({ ...d, [k]: v } as Settings) : d)); };

  /** Same rules as the API, so mistakes show before the review opens. */
  const problem = (): string | null => {
    for (const k of changed) {
      const p = checkSetting(k, draft![k]);
      if (p) return p.includes(`"${k}"`) ? p.replace(`"${k}"`, fieldLabel(k)) : p;
    }
    return checkSettings({ ...data!, ...draft! }, changed);
  };

  const save = async () => {
    if (!draft || !changed.length) return;
    setSaving(true); setSaveError("");
    try {
      const patch = Object.fromEntries(changed.map((k) => [k, draft[k]])) as Partial<Settings>;
      setData(await adminApi.settings.update(patch));
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
      setReviewing(false);
    }
  };

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!draft || !data) return <div className="card p-6"><div className="skeleton h-5 w-40" /><div className="skeleton h-4 w-72 mt-3" /></div>;

  const q = query.trim().toLowerCase();
  const current = SETTING_TABS.find((t) => t.id === tab) ?? SETTING_TABS[0];
  const groups = q
    ? SETTING_GROUPS.map((g) => ({ g, fields: g.fields.filter((f) => [f.label, f.help, f.key, g.title].some((s) => s.toLowerCase().includes(q))) })).filter((x) => x.fields.length)
    : SETTING_GROUPS.filter((g) => current.groups.includes(g.title)).map((g) => ({ g, fields: g.fields }));
  const matches = groups.reduce((n, x) => n + x.fields.length, 0);
  const unsavedIn = (t: (typeof SETTING_TABS)[number]) =>
    changed.filter((k) => SETTING_GROUPS.some((g) => t.groups.includes(g.title) && g.fields.some((f) => f.key === k))).length;
  const row: RowProps = { draft, data, editable, canHistory, onChange: change, onHistory: setHistoryKey };

  return (
    <div className="grid gap-4 pb-24">
      {!editable && <p className="text-sm text-muted">Only owners can change settings. You can see the current values.</p>}

      <div className="grid gap-3">
        <div className="relative sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
          <label htmlFor="settings-search" className="sr-only">Search settings</label>
          <input id="settings-search" type="search" className="field pl-9" placeholder="Search, e.g. surge, GST, deposit"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!q && (
          <div role="tablist" aria-label="Settings areas" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
            {SETTING_TABS.map((t) => {
              const n = unsavedIn(t);
              return (
                <button key={t.id} type="button" role="tab" aria-selected={t.id === current.id} onClick={() => setTab(t.id)}
                  className={cx("shrink-0 px-3 py-1.5 rounded-full border text-sm transition-colors",
                    t.id === current.id ? "border-brand-dark bg-nav-active text-strong font-medium" : "border-line text-muted hover:text-fg")}>
                  {t.label}{n > 0 && <span className="ml-1.5 text-xs font-semibold text-accent" aria-label={`${n} unsaved`}>{n}</span>}
                </button>
              );
            })}
          </div>
        )}
        {q && <p className="text-sm text-muted" role="status">{matches} setting{matches === 1 ? "" : "s"} match “{query.trim()}”.</p>}
      </div>

      {!q && current.preview && <SettingsFarePreview kinds={current.preview} now={data} draft={draft} />}
      {groups.map(({ g, fields }) => <GroupCard key={g.title} g={g} fields={fields} row={row} />)}

      <Modal open={historyKey !== null} title={historyKey ? `History: ${fieldLabel(historyKey)}` : ""} onClose={() => setHistoryKey(null)}>
        {historyKey && <HistoryList settingKey={historyKey} canRestore={editable} onRestore={(v) => { change(historyKey, v); setHistoryKey(null); }} />}
      </Modal>

      <Modal open={reviewing} title={`Save ${changed.length} change${changed.length === 1 ? "" : "s"}?`} onClose={() => setReviewing(false)} busy={saving}
        footer={<><Button onClick={() => setReviewing(false)} disabled={saving}>Keep editing</Button><Button variant="primary" loading={saving} onClick={save}>Save changes</Button></>}>
        <ul className="grid gap-2 text-sm">
          {changed.map((k) => (
            <li key={k} className="rounded-lg border border-line p-3">
              <p className="font-medium text-fg">{fieldLabel(k)}</p>
              <p className="mt-0.5 break-words"><span className="text-muted line-through">{showValue(fieldOf(k), data[k])}</span> → <span className="text-strong font-medium">{showValue(fieldOf(k), draft[k])}</span></p>
              {isTermKey(k) && <p className="text-xs text-subtle mt-0.5">Applies to new bookings only.</p>}
            </li>
          ))}
        </ul>
        <p className="text-xs text-subtle mt-3">Customers see the change within 30 seconds. It&apos;s recorded in the audit log.</p>
      </Modal>

      {editable && (
        <div className={cx("fixed bottom-0 inset-x-0 lg:left-(--sidebar-width) z-20 border-t border-line bg-surface/95 backdrop-blur px-4 py-3 sm:px-6 lg:px-8",
          "flex flex-wrap items-center justify-end gap-3")}>
          {saveError && <p className="text-sm text-danger mr-auto" role="alert">{saveError}</p>}
          {!saveError && saved && !changed.length && <p className="text-sm text-success mr-auto inline-flex items-center gap-1.5"><Check size={16} /> Saved. Customers see it within 30 seconds.</p>}
          {!saveError && changed.length > 0 && <p className="text-sm text-muted mr-auto">{changed.length} unsaved change{changed.length === 1 ? "" : "s"}</p>}
          <Button disabled={!changed.length || saving} onClick={() => { setDraft(data); setSaveError(""); }}>Discard</Button>
          <Button variant="primary" disabled={!changed.length} onClick={() => { const p = problem(); if (p) setSaveError(p); else { setSaveError(""); setReviewing(true); } }}>Review and save</Button>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <RequireAdmin permission="dashboard.view">
      <PageHeader title="Settings" sub="Business rules for the website and the app. Every change is recorded in the audit log." />
      <SettingsForm />
    </RequireAdmin>
  );
}
