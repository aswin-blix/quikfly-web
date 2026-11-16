"use client";
// One form for every catalog kind, built from its field definitions in @quikfly/shared
// (catalog-kinds.ts). The same definitions validate here (early) and in the API (always).
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CATALOG_DEFS, isCatalogKind, validateCatalogData, type CatalogField, type CatalogKind } from "@quikfly/shared";
import { Button, ErrorBox, Field, PageHeader, Toggle } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { RequireAdmin, useSession } from "@/lib/session";

type FormValue = string | string[];
type Values = Record<string, FormValue>;

/** Item data → form strings (lists become one entry per line). */
function toForm(fields: CatalogField[], data: Record<string, unknown> | null): Values {
  const v: Values = {};
  for (const f of fields) {
    const x = data?.[f.key];
    if (f.type === "multiselect") v[f.key] = Array.isArray(x) ? (x as string[]) : [];
    else if (f.type === "list") v[f.key] = Array.isArray(x) ? (x as string[]).join("\n") : "";
    else if (f.type === "select") v[f.key] = x === undefined || x === null ? f.options![0] : String(x);
    else v[f.key] = x === undefined || x === null ? "" : String(x);
  }
  return v;
}

/** Form strings → the data shape the API expects. */
function fromForm(fields: CatalogField[], v: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const x = v[f.key];
    if (f.type === "int" || f.type === "number") out[f.key] = x === "" ? null : Number(x);
    else if (f.type === "list") out[f.key] = String(x).split("\n").map((s) => s.trim()).filter(Boolean);
    else if (f.type === "date") out[f.key] = x === "" ? null : x;
    else out[f.key] = x;
  }
  return out;
}

function Input({ f, value, onChange }: { f: CatalogField; value: FormValue; onChange: (v: FormValue) => void }) {
  const id = `f-${f.key}`;
  switch (f.type) {
    case "longtext":
      return <textarea id={id} className="field min-h-24" maxLength={f.maxLength} value={value as string} onChange={(e) => onChange(e.target.value)} />;
    case "list":
      return <textarea id={id} className="field min-h-28 font-mono text-sm" value={value as string} onChange={(e) => onChange(e.target.value)} />;
    case "select":
      return (
        <select id={id} className="field" value={value as string} onChange={(e) => onChange(e.target.value)}>
          {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case "multiselect": {
      const on = value as string[];
      return (
        <div id={id} role="group" aria-label={f.label} className="flex flex-wrap gap-2">
          {f.options!.map((o) => (
            <button key={o} type="button" aria-pressed={on.includes(o)} onClick={() => onChange(on.includes(o) ? on.filter((x) => x !== o) : [...on, o])}
              className={cx("px-3 py-1.5 rounded-full border text-sm transition-colors", on.includes(o) ? "border-brand-dark bg-nav-active text-strong font-medium" : "border-line text-muted hover:text-fg")}>
              {o}
            </button>
          ))}
        </div>
      );
    }
    case "date":
      return <input id={id} type="date" className="field sm:w-56" value={value as string} onChange={(e) => onChange(e.target.value)} />;
    case "int": case "number":
      return <input id={id} type="number" inputMode={f.type === "int" ? "numeric" : "decimal"} step={f.type === "int" ? 1 : "any"} min={f.min} max={f.max}
        className="field sm:w-56" value={value as string} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input id={id} className={cx("field", f.upper && "uppercase")} maxLength={f.maxLength} value={value as string} onChange={(e) => onChange(e.target.value)} />;
  }
}

function EditForm({ kind, id }: { kind: CatalogKind; id: string | null }) {
  const def = CATALOG_DEFS[kind];
  const router = useRouter();
  const { can } = useSession();
  const [values, setValues] = useState<Values | null>(id ? null : toForm(def.fields, null));
  const [active, setActive] = useState(true);
  const [sort, setSort] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    adminApi.catalog.list(kind).then((items) => {
      const item = items.find((x) => x.id === id);
      if (!item) return setLoadError(`That ${def.singular} doesn't exist any more.`);
      setValues(toForm(def.fields, item.data as unknown as Record<string, unknown>));
      setActive(item.active);
      setSort(String(item.sort));
    }).catch((e: Error) => setLoadError(e.message));
  }, [kind, id, def]);

  if (!can(def.permission)) return <ErrorBox message="Your role can't edit this part of the catalog." />;
  if (loadError) return <ErrorBox message={loadError} />;
  if (!values) return <div className="card p-6 grid gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10" />)}</div>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = fromForm(def.fields, values);
    const check = validateCatalogData(kind, data, id ?? "new");
    if ("error" in check) return setError(check.error);
    const sortNum = sort.trim() === "" ? undefined : Number(sort);
    if (sortNum !== undefined && (!Number.isInteger(sortNum) || sortNum < 0)) return setError("Order must be a whole number from 0.");
    setSaving(true); setError("");
    try {
      if (id) await adminApi.catalog.update(kind, id, { data, active, sort: sortNum });
      else await adminApi.catalog.create(kind, { data, active, sort: sortNum });
      router.push(`/catalog/list?kind=${kind}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-4 pb-24" noValidate>
      <section className="card p-5 grid gap-5">
        {def.fields.map((f) => (
          <Field key={f.key} label={`${f.label}${f.optional ? " (optional)" : ""}`} htmlFor={`f-${f.key}`} hint={f.hint}>
            <Input f={f} value={values[f.key]} onChange={(v) => setValues({ ...values, [f.key]: v })} />
          </Field>
        ))}
      </section>
      <section className="card p-5 grid gap-5 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-fg">Visible to customers</p>
            <p className="text-xs text-subtle">Off hides it on the website and the app without deleting it.</p>
          </div>
          <Toggle label="Visible to customers" checked={active} onChange={setActive} />
        </div>
        <Field label="Order (optional)" htmlFor="f-sort" hint="Lower numbers come first. Empty puts a new item last.">
          <input id="f-sort" type="number" min={0} step={1} className="field sm:w-40" value={sort} onChange={(e) => setSort(e.target.value)} />
        </Field>
      </section>
      <div className="fixed bottom-0 inset-x-0 lg:left-(--sidebar-width) z-20 border-t border-line bg-surface/95 backdrop-blur px-4 py-3 sm:px-6 lg:px-8 flex flex-wrap items-center justify-end gap-3">
        {error && <p className="text-sm text-danger mr-auto" role="alert">{error}</p>}
        <Link href={`/catalog/list?kind=${kind}`}><Button type="button">Cancel</Button></Link>
        <Button variant="primary" loading={saving}>{id ? "Save changes" : `Add ${def.singular}`}</Button>
      </div>
    </form>
  );
}

function EditPage() {
  const params = useSearchParams();
  const kind = params.get("kind") ?? "";
  const id = params.get("id");
  if (!isCatalogKind(kind)) return <ErrorBox message="Unknown catalog section." />;
  const def = CATALOG_DEFS[kind];
  return (
    <>
      <Link href={`/catalog/list?kind=${kind}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg mb-3"><ChevronLeft size={16} /> {def.label}</Link>
      <PageHeader title={id ? `Edit ${def.singular}` : `Add ${def.singular}`} sub={def.description} />
      <EditForm key={`${kind}/${id}`} kind={kind} id={id} />
    </>
  );
}

export default function Page() {
  return <RequireAdmin><Suspense><EditPage /></Suspense></RequireAdmin>;
}
