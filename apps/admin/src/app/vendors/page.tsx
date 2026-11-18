"use client";
// Partner applications from the QuikFly Partner app, by status. Waiting for review is
// oldest first; open one to review it section by section.
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Handshake } from "lucide-react";
import { VENDOR_VEHICLE_LABEL, formatRegNumber, type FleetReviewItem, type VendorStatus } from "@quikfly/shared";
import { Empty, ErrorBox, PageHeader, Segmented } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { VENDOR_TAB_LABEL, cx, timeAgo } from "@/lib/format";
import { RequireAdmin } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

type Tab = VendorStatus | "fleet";
const TABS: Tab[] = ["submitted", "fleet", "onboarding", "active", "draft", "rejected"];
const FLEET_KIND: Record<FleetReviewItem["kind"], string> = {
  vehicle: "New vehicle to review", vehicle_sticker: "Vehicle waiting for sticker & paint", vehicle_docs: "Renewed vehicle document",
  driver: "New driver to review", driver_docs: "Renewed driving licence",
};

/** Live partners' vehicles and drivers waiting for staff. */
function FleetQueue() {
  const { data, error, reload } = useLoad(() => adminApi.vendors.fleetQueue(), []);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <div className="card p-5 grid gap-3">{[0, 1].map((i) => <div key={i} className="skeleton h-14" />)}</div>;
  return (
    <div className="card">
      {data.length === 0 ? <Empty icon={Handshake} title="Nothing waiting" sub="Vehicles and drivers that live partners add appear here, oldest first." /> : (
        <ul className="divide-y divide-line">
          {data.map((x) => (
            <li key={`${x.kind}-${x.id}`}>
              <Link href={`/vendors/view?id=${encodeURIComponent(x.vendorId)}`} className="px-4 sm:px-5 py-4 flex items-center gap-3 hover:bg-fg/[0.03]">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg">{FLEET_KIND[x.kind]}: <span className={x.kind.startsWith("vehicle") ? "font-mono" : ""}>{x.label}</span></p>
                  <p className="text-xs text-subtle">{x.vendorName} · {timeAgo(x.since)}</p>
                </div>
                <ChevronRight size={18} className="text-subtle shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Queue() {
  const [tab, setTab] = useState<Tab>("submitted");
  const status: VendorStatus = tab === "fleet" ? "submitted" : tab;
  const { data, error, loading, reload } = useLoad(() => adminApi.vendors.list(status), [status]);

  return (
    <>
      <PageHeader title="Partners" sub="Vehicle owners who apply in the QuikFly Partner app. Review each section, then approve, send back for changes, or reject." />
      <div className="mb-4"><Segmented label="Show" value={tab} onChange={setTab} options={TABS.map((s) => ({ value: s, label: s === "fleet" ? "Fleet to review" : VENDOR_TAB_LABEL[s] }))} /></div>
      {tab === "fleet" ? <FleetQueue /> : <>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <div className="card p-5 grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>}
      {data && (
        <div className={cx("card transition-opacity", loading && "opacity-60")}>
          {data.length === 0 ? (
            <Empty icon={Handshake} title={tab === "submitted" ? "Nothing to review" : `No partners ${VENDOR_TAB_LABEL[status].toLowerCase()}`}
              sub={tab === "submitted" ? "Applications appear here, oldest first, once a partner sends them." : undefined} />
          ) : (
            <ul className="divide-y divide-line">
              {data.map((v) => (
                <li key={v.id}>
                  <Link href={`/vendors/view?id=${encodeURIComponent(v.id)}`} className="px-4 sm:px-5 py-4 flex items-center gap-3 hover:bg-fg/[0.03]">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg">{v.name} <span className="text-subtle font-normal">· {v.phone}</span></p>
                      <p className="text-sm text-strong mt-0.5">
                        {v.vehicle ? <><span className="font-mono">{formatRegNumber(v.vehicle.regNumber)}</span> · {VENDOR_VEHICLE_LABEL[v.vehicle.type]}</> : "No vehicle yet"}
                        {v.city && <span className="text-muted"> · {v.city}</span>}
                      </p>
                      <p className="text-xs text-subtle">
                        {v.submittedAt ? `Sent ${timeAgo(v.submittedAt)}` : `Updated ${timeAgo(v.updatedAt)}`}
                        {tab === "submitted" && ` · ${v.open} of 6 sections to review`}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-subtle shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </>}
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="vendors.review"><Queue /></RequireAdmin>;
}
