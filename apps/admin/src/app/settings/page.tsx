"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { SETTING_RULES, checkSetting, checkSettings, type Settings } from "@quikfly/shared";
import { Button, ErrorBox, PageHeader, Toggle } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { RequireAdmin, useSession } from "@/lib/session";
import { SETTING_GROUPS, type SettingField } from "@/lib/settings-fields";
import { useLoad } from "@/lib/useLoad";

function FieldInput({ f, value, onChange, disabled }: { f: SettingField; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  if (f.type === "toggle") return <Toggle label={f.label} checked={!!value} onChange={onChange} disabled={disabled} />;
  const rule = SETTING_RULES[f.key];
  const limits = rule.type === "number" ? { min: rule.min, max: rule.max, step: f.step ?? (rule.integer ? 1 : "any") } : rule.type === "text" ? { maxLength: rule.max } : {};
  return (
    <div className="flex items-center gap-2 w-full sm:w-48">
      {f.unit === "₹" && <span className="text-muted">₹</span>}
      <input
        id={`set-${f.key}`} className="field" disabled={disabled}
        type={f.type === "number" ? "number" : "text"} {...limits}
        value={String(value ?? "")}
        onChange={(e) => onChange(f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
      />
      {f.unit && f.unit !== "₹" && <span className="text-muted text-sm">{f.unit}</span>}
    </div>
  );
}

function SettingsForm() {
  const { can } = useSession();
  const editable = can("settings.edit");
  const { data, setData, error, reload } = useLoad(() => adminApi.settings.get(), []);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (data) setDraft(data); }, [data]);

  const changed = data && draft ? (Object.keys(draft) as (keyof Settings)[]).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(data[k])) : [];

  const save = async () => {
    if (!draft || !changed.length) return;
    // Same rules as the API, so mistakes show before saving.
    for (const k of changed) {
      const problem = checkSetting(k, draft[k]);
      if (problem) {
        const label = SETTING_GROUPS.flatMap((g) => g.fields).find((f) => f.key === k)?.label ?? k;
        return setSaveError(problem.includes(`"${k}"`) ? problem.replace(`"${k}"`, label) : problem);
      }
    }
    // Rules between settings (e.g. surge multiplier <= cap), the same check the API runs.
    const cross = checkSettings({ ...data!, ...draft }, changed);
    if (cross) return setSaveError(cross);
    setSaving(true); setSaveError(""); setSaved(false);
    try {
      const patch = Object.fromEntries(changed.map((k) => [k, draft[k]])) as Partial<Settings>;
      setData(await adminApi.settings.update(patch));
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!draft) return <div className="card p-6"><div className="skeleton h-5 w-40" /><div className="skeleton h-4 w-72 mt-3" /></div>;

  return (
    <div className="grid gap-4 pb-24">
      {!editable && <p className="text-sm text-muted">Only owners can change settings. You can see the current values.</p>}
      {SETTING_GROUPS.map((g) => (
        <section key={g.title} className="card" aria-labelledby={`g-${g.title}`}>
          <div className="px-5 pt-5 pb-3 border-b border-line">
            <h2 id={`g-${g.title}`} className="font-semibold text-strong">{g.title}</h2>
            <p className="text-sm text-muted mt-0.5">{g.sub}</p>
          </div>
          <div className="divide-y divide-line">
            {g.fields.map((f) => (
              <div key={f.key} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <div className="flex-1 min-w-0">
                  <label htmlFor={`set-${f.key}`} className="text-sm font-medium text-fg">{f.label}</label>
                  <p className="text-xs text-subtle mt-0.5">{f.help}</p>
                </div>
                <FieldInput f={f} value={draft[f.key]} disabled={!editable}
                  onChange={(v) => { setSaved(false); setDraft({ ...draft, [f.key]: v } as Settings); }} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {editable && (
        <div className={cx("fixed bottom-0 inset-x-0 lg:left-(--sidebar-width) z-20 border-t border-line bg-surface/95 backdrop-blur px-4 py-3 sm:px-6 lg:px-8",
          "flex flex-wrap items-center justify-end gap-3")}>
          {saveError && <p className="text-sm text-danger mr-auto" role="alert">{saveError}</p>}
          {saved && !changed.length && <p className="text-sm text-success mr-auto inline-flex items-center gap-1.5"><Check size={16} /> Saved. Customers see it within 30 seconds.</p>}
          {changed.length > 0 && <p className="text-sm text-muted mr-auto">{changed.length} unsaved change{changed.length === 1 ? "" : "s"}</p>}
          <Button disabled={!changed.length || saving} onClick={() => { setDraft(data); setSaveError(""); }}>Discard</Button>
          <Button variant="primary" disabled={!changed.length} loading={saving} onClick={save}>Save changes</Button>
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
