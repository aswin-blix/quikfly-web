"use client";
import { useState } from "react";
import { ChevronDown, ScrollText } from "lucide-react";
import type { AuditEntry } from "@quikfly/shared";
import { Empty, ErrorBox, PageHeader, Pager } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { cx, dateTime } from "@/lib/format";
import { RequireAdmin } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

/** Filter choices; values are audit `entity` names written by the API. */
const ENTITIES = [
  { value: "", label: "Everything" },
  { value: "settings", label: "Settings" },
  { value: "booking", label: "Bookings" },
  { value: "licence", label: "Licences" },
  { value: "catalog", label: "Catalog" },
  { value: "offer", label: "Offers" },
  { value: "admin", label: "Staff accounts" },
];

/** "settings.update" → "Settings update" */
const actionLabel = (a: string) => a.replace(/[._-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function Row({ e }: { e: AuditEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full text-left px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-raised/60">
        <span className="flex-1 min-w-[12rem]">
          <span className="block text-sm text-fg">{actionLabel(e.action)}{e.entityId && <span className="text-subtle font-mono text-xs"> · {e.entityId}</span>}</span>
          <span className="block text-xs text-subtle">{e.admin ? e.admin.name : "Script"}</span>
        </span>
        <span className="text-xs text-subtle">{dateTime(e.createdAt)}</span>
        <ChevronDown size={16} className={cx("text-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <pre className="mx-5 mb-3 p-3 rounded-field bg-raised text-xs font-mono text-fg overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(e.detail, null, 2)}
        </pre>
      )}
    </li>
  );
}

function AuditList() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState("");
  const { data, error, loading, reload } = useLoad(() => adminApi.audit(page, entity || undefined), [page, entity]);

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="entity" className="label">Show</label>
        <select id="entity" className="field w-auto" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
          {ENTITIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className={cx("card transition-opacity", loading && "opacity-60")}>
          {data.items.length === 0 ? <Empty icon={ScrollText} title="Nothing recorded yet" sub="Changes made in the admin panel appear here." /> : (
            <ul className="divide-y divide-line">{data.items.map((e) => <Row key={e.id} e={e} />)}</ul>
          )}
          <div className="px-5 pb-4"><Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div>
        </div>
      )}
      {!data && !error && <div className="card p-5 grid gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10" />)}</div>}
    </>
  );
}

export default function Page() {
  return (
    <RequireAdmin permission="audit.view">
      <PageHeader title="Audit log" sub="Every change made by staff, newest first. Open a row to see what changed." />
      <AuditList />
    </RequireAdmin>
  );
}
