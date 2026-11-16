"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { CATALOG_DEFS, isCatalogKind, type CatalogItem, type CatalogKind } from "@quikfly/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge, Button, Empty, ErrorBox, PageHeader, Toggle } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { cx, dateTime } from "@/lib/format";
import { RequireAdmin, useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

function KindList({ kind }: { kind: CatalogKind }) {
  const def = CATALOG_DEFS[kind];
  const { can } = useSession();
  const { data, setData, error, loading, reload } = useLoad(() => adminApi.catalog.list(kind), [kind]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [toDelete, setToDelete] = useState<CatalogItem | null>(null);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((i) => !s || `${def.title(i.data as never)} ${def.detail(i.data as never)}`.toLowerCase().includes(s));
  }, [data, q, def]);

  if (!can(def.permission)) return <ErrorBox message="Your role can't edit this part of the catalog." />;

  const replace = (item: CatalogItem) => setData((list) => list?.map((x) => (x.id === item.id ? item : x)) ?? null);

  const toggle = async (item: CatalogItem, active: boolean) => {
    setBusy(item.id); setActionError("");
    try { replace(await adminApi.catalog.update(kind, item.id, { active })); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Couldn't update."); }
    finally { setBusy(null); }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(toDelete.id); setActionError("");
    try {
      await adminApi.catalog.remove(kind, toDelete.id);
      setData((list) => list?.filter((x) => x.id !== toDelete.id) ?? null);
      setToDelete(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't delete.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {kind !== "offer" && (
        <Link href="/catalog" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg mb-3"><ChevronLeft size={16} /> Catalog</Link>
      )}
      <PageHeader
        title={def.label}
        sub={def.description}
        actions={<Link href={`/catalog/edit?kind=${kind}`}><Button variant="primary"><Plus size={16} /> Add {def.singular}</Button></Link>}
      />
      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
        <input className="field pl-9" placeholder={`Search ${def.label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${def.label}`} />
      </div>
      {actionError && <div className="mb-3"><ErrorBox message={actionError} /></div>}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <div className="card p-5 grid gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10" />)}</div>}
      {data && (
        <div className={cx("card transition-opacity", loading && "opacity-60")}>
          {shown.length === 0 ? (
            <Empty title={q ? "Nothing matches your search" : `No ${def.label.toLowerCase()} yet`} sub={q ? undefined : `Add the first ${def.singular}.`} />
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((item) => (
                <li key={item.id} className={cx("px-4 sm:px-5 py-3 flex items-center gap-3", !item.active && "bg-raised/40")}>
                  <div className="flex-1 min-w-0">
                    <p className={cx("text-sm font-medium truncate", item.active ? "text-fg" : "text-muted")}>
                      {def.title(item.data as never)}
                      {!item.active && <Badge className="ml-2 bg-raised text-subtle border border-line">Hidden</Badge>}
                    </p>
                    <p className="text-xs text-subtle truncate">{def.detail(item.data as never) || item.id}</p>
                    <p className="text-[11px] text-subtle/80 mt-0.5 hidden sm:block">Updated {dateTime(item.updatedAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="sr-only">{item.active ? "Visible to customers" : "Hidden from customers"}</span>
                    <Toggle label={`Show ${def.title(item.data as never)} to customers`} checked={item.active} disabled={busy === item.id} onChange={(v) => toggle(item, v)} />
                    <Link href={`/catalog/edit?kind=${kind}&id=${encodeURIComponent(item.id)}`} aria-label={`Edit ${def.title(item.data as never)}`}
                      className="size-9 grid place-items-center rounded-field text-muted hover:text-fg hover:bg-raised ml-1"><Pencil size={16} /></Link>
                    <button onClick={() => setToDelete(item)} aria-label={`Delete ${def.title(item.data as never)}`}
                      className="size-9 grid place-items-center rounded-field text-muted hover:text-danger hover:bg-danger/10"><Trash2 size={16} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs text-subtle mt-3">The switch shows or hides an item without deleting it. Bookings already made keep their own copy of what was bought.</p>
      <ConfirmDialog
        open={!!toDelete} title={`Delete this ${def.singular}?`} confirmLabel="Delete" danger busy={busy === toDelete?.id}
        onCancel={() => setToDelete(null)} onConfirm={remove}
      >
        <b className="text-fg">{toDelete && def.title(toDelete.data as never)}</b> will be removed for good. To take it off the website for now, use the switch to hide it instead.
      </ConfirmDialog>
    </>
  );
}

function ListPage() {
  const kind = useSearchParams().get("kind") ?? "";
  if (!isCatalogKind(kind)) return <ErrorBox message="Unknown catalog section." />;
  return <KindList key={kind} kind={kind} />;
}

export default function Page() {
  return <RequireAdmin><Suspense><ListPage /></Suspense></RequireAdmin>;
}
