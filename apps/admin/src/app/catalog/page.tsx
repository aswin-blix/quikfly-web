"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import { CATALOG_DEFS, type CatalogKindDef } from "@quikfly/shared";
import { Button, ErrorBox, PageHeader } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { adminApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { RequireAdmin, useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

const GROUPS: CatalogKindDef["group"][] = ["Rides", "Bus", "Holidays", "Rentals", "Marketing"];

function Overview() {
  const { can } = useSession();
  const { data, error, loading, reload } = useLoad(() => adminApi.catalog.kinds(), []);
  const [confirm, setConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState("");

  const reset = async () => {
    setResetting(true);
    try {
      await adminApi.catalog.reset();
      setNotice("Catalog restored to the sample data.");
      setConfirm(false);
      reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't reset.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Catalog"
        sub="What customers can book on the website and the app. Changes show within about 30 seconds; hidden items disappear at once for new visitors."
        actions={can("settings.edit") && <Button variant="danger" onClick={() => setConfirm(true)}><RotateCcw size={16} /> Reset to sample data</Button>}
      />
      {notice && <p className="text-sm text-success mb-4" role="status">{notice}</p>}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="card p-5"><div className="skeleton h-5 w-32" /><div className="skeleton h-4 w-48 mt-3" /></div>)}</div>}
      {data && (
        <div className={cx("grid gap-6 transition-opacity", loading && "opacity-60")}>
          {GROUPS.map((group) => {
            const kinds = data.filter((k) => CATALOG_DEFS[k.kind].group === group && k.canEdit);
            if (!kinds.length) return null;
            return (
              <section key={group} aria-labelledby={`grp-${group}`}>
                <h2 id={`grp-${group}`} className="text-sm font-semibold text-muted mb-2">{group}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {kinds.map((k) => {
                    const def = CATALOG_DEFS[k.kind];
                    return (
                      <Link key={k.kind} href={`/catalog/list?kind=${k.kind}`} className="card p-5 hover:border-line-strong transition-colors group">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-strong">{def.label}</p>
                          <ArrowRight size={16} className="text-subtle group-hover:text-accent transition-colors" />
                        </div>
                        <p className="text-xs text-subtle mt-1 line-clamp-2">{def.description}</p>
                        <p className="text-sm text-fg mt-3 tabular-nums">{k.visible} visible{k.total > k.visible && <span className="text-subtle"> · {k.total - k.visible} hidden</span>}</p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={confirm} title="Reset the whole catalog?" confirmLabel="Reset catalog" busy={resetting} danger
        onCancel={() => setConfirm(false)} onConfirm={reset}
      >
        Every place, ride type, holiday, car, offer and FAQ goes back to the original sample data. Anything added or edited here is lost. Bookings already made keep their details. Settings are not changed.
      </ConfirmDialog>
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="catalog.edit"><Overview /></RequireAdmin>;
}
