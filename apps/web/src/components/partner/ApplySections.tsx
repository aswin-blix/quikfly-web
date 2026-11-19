"use client";
// The six step-1 sections of a partner application, as forms. Same fields and checks as the
// QuikFly Partner app (apps/mobile/lib/partner/section_screen.dart); the API checks again.
import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp } from "lucide-react";
import {
  AUDIT_SLOTS, AUDIT_SLOT_LABEL, FUEL_LABEL, FUEL_TYPES, VENDOR_RULES, VENDOR_VEHICLE_LABEL, VENDOR_VEHICLE_TYPES, normaliseRegNumber, vehicleAgeYears,
  type AuditSlot, type FuelType, type VendorApplication, type VendorDocument, type VendorSection, type VendorVehicleType,
} from "@quikfly/shared";
import { useConfig, useSettings } from "@/components/ConfigProvider";
import { GoldButton } from "@/components/ui";
import { ErrorText, Field } from "@/components/account/kit";
import { api } from "@/lib/api";
import { cx, prettyDate, shiftISO, todayISO } from "@/lib/format";
import { PHOTO_MAX_EDGE, PHOTO_QUALITY } from "@/lib/partner";

/** Shrinks a photo to a JPEG the API accepts (well under VENDOR_RULES.maxPhotoBytes). */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", PHOTO_QUALITY));
}

/** A document photo: the saved one (if any) and a picker that uploads at once. */
function PhotoField({ kind, has, readOnly, label, onSaved }: { kind: VendorDocument; has: boolean; readOnly: boolean; label: string; onSaved: (a: VendorApplication) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    if (has) api.vendor.documentUrl(kind).then((u) => live && setUrl(u), () => undefined);
    return () => { live = false; };
  }, [kind, has]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const a = await api.vendor.uploadDocument(kind, await shrink(file));
      setUrl(URL.createObjectURL(file));
      onSaved(a);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <p className="label mb-2">{label}</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-28 h-20 rounded-xl border border-line overflow-hidden grid place-items-center bg-fg/5 shrink-0">
          {url ? <img src={url} alt={label} className="w-full h-full object-cover" /> : <span className="text-xs text-subtle">{has ? "Saved" : "No photo yet"}</span>}
        </div>
        {!readOnly && (
          <label className={cx("chip inline-flex items-center gap-2 cursor-pointer !text-sm", busy && "opacity-60 pointer-events-none")}>
            {kind === "photo" ? <Camera size={16} /> : <ImageUp size={16} />}
            {busy ? "Uploading…" : has || url ? "Replace photo" : "Add photo"}
            <input ref={input} type="file" accept={VENDOR_RULES.photoTypes.join(",")} capture={kind === "photo" ? "user" : "environment"} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        )}
      </div>
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>
    </div>
  );
}

type Props = { app: VendorApplication; section: VendorSection; readOnly: boolean; onSaved: (a: VendorApplication) => void };

/** One section's form. Saving updates the application (the section turns "filled" when complete). */
export function SectionForm({ app, section, readOnly, onSaved }: Props) {
  const settings = useSettings();
  const cities = useConfig()?.cities ?? [];
  const v = app.vehicle;
  const [f, setF] = useState<Record<string, string>>(() => ({
    city: app.city ?? "", type: v?.type ?? "", fuel: v?.fuel ?? "", regNumber: v?.regNumber ?? "", purchaseDate: v?.purchaseDate ?? "",
    holder: app.bank?.holder ?? "", account: "", account2: "", ifsc: app.bank?.ifsc ?? "",
    ownerName: v?.rc?.ownerName ?? "", rcValidTill: v?.rc?.validTill ?? "",
    insurer: v?.insurance?.insurer ?? "", policyNumber: v?.insurance?.policyNumber ?? "", insValidTill: v?.insurance?.validTill ?? "",
    auditDate: v?.audit?.date ?? "", slot: v?.audit?.slot ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const today = todayISO();
  const id = (k: string) => `${section}-${k}`;

  /** The first thing missing or wrong, checked before calling the API (it checks again). */
  function problem(): string | null {
    switch (section) {
      case "vehicle":
        if (!f.city) return "Choose your city.";
        if (!f.type) return "Choose the vehicle type.";
        if (!f.fuel) return "Choose the fuel type.";
        if (!VENDOR_RULES.regNumber.test(normaliseRegNumber(f.regNumber))) return "Enter the registration number as on the RC, e.g. TN57AX9979.";
        if (!f.purchaseDate) return "Pick the purchase date.";
        if (vehicleAgeYears(f.purchaseDate, today) >= settings.vendorMaxVehicleAgeYears) return `Vehicles older than ${settings.vendorMaxVehicleAgeYears} years can't join QuikFly.`;
        return null;
      case "bank": {
        const acct = f.account.replace(/\s/g, "");
        if (f.holder.trim().length < VENDOR_RULES.nameMin) return "Enter the account holder's name.";
        if (!VENDOR_RULES.account.test(acct)) return "Enter the account number (9 to 18 digits).";
        if (acct !== f.account2.replace(/\s/g, "")) return "The account numbers don't match.";
        if (!VENDOR_RULES.ifsc.test(f.ifsc.trim().toUpperCase())) return "Enter the 11-character IFSC, e.g. SBIN0001234.";
        return null;
      }
      case "rc":
        if (f.ownerName.trim().length < VENDOR_RULES.nameMin) return "Enter the owner's name as on the RC.";
        return f.rcValidTill ? null : "Pick the registration validity date.";
      case "insurance":
        if (f.insurer.trim().length < 2) return "Enter the insurance company.";
        if (!VENDOR_RULES.policyNumber.test(f.policyNumber.trim().toUpperCase().replace(/\s/g, ""))) return "Enter the policy number as on the certificate.";
        return f.insValidTill ? null : "Pick the insurance validity date.";
      case "audit":
        if (!f.auditDate) return "Pick a day for the audit.";
        return f.slot ? null : "Pick a time slot.";
      default:
        return null;
    }
  }

  async function save() {
    const p = problem();
    if (p) { setError(p); return; }
    setBusy(true); setError("");
    try {
      const body: Record<string, Record<string, unknown>> = {
        vehicle: { city: f.city, type: f.type, fuel: f.fuel, regNumber: f.regNumber, purchaseDate: f.purchaseDate },
        bank: { holder: f.holder.trim(), account: f.account.replace(/\s/g, ""), ifsc: f.ifsc.trim().toUpperCase() },
        rc: { ownerName: f.ownerName.trim(), validTill: f.rcValidTill },
        insurance: { insurer: f.insurer.trim(), policyNumber: f.policyNumber.trim().toUpperCase().replace(/\s/g, ""), validTill: f.insValidTill },
        audit: { date: f.auditDate, slot: f.slot },
      };
      onSaved(await api.vendor.saveSection(section as Exclude<VendorSection, "photo">, body[section]));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const chips = <T extends string>(k: string, options: readonly T[], label: (o: T) => string) => (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={f[k] === o} data-on={f[k] === o} disabled={readOnly} onClick={() => setF((x) => ({ ...x, [k]: o }))} className="chip !text-sm">{label(o)}</button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {section === "vehicle" && (
        <>
          <Field label="City" htmlFor={id("city")}>
            <select id={id("city")} className="field" value={f.city} onChange={set("city")} disabled={readOnly}>
              <option value="">Choose your city</option>
              {cities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <div><p className="label mb-2">Vehicle type</p>{chips<VendorVehicleType>("type", VENDOR_VEHICLE_TYPES, (t) => VENDOR_VEHICLE_LABEL[t])}</div>
          <div><p className="label mb-2">Fuel</p>{chips<FuelType>("fuel", FUEL_TYPES, (t) => FUEL_LABEL[t])}</div>
          <Field label="Vehicle registration number" htmlFor={id("reg")} hint={`Vehicles up to ${settings.vendorMaxVehicleAgeYears} years old can join.`}>
            <input id={id("reg")} className="field uppercase" placeholder="TN57AX9979" value={f.regNumber} onChange={set("regNumber")} readOnly={readOnly} autoCapitalize="characters" />
          </Field>
          <Field label="Purchase date" htmlFor={id("purchase")}>
            <input id={id("purchase")} type="date" className="field" max={today} value={f.purchaseDate} onChange={set("purchaseDate")} readOnly={readOnly} />
          </Field>
        </>
      )}
      {section === "photo" && (
        <>
          <p className="text-sm text-muted">A clear photo of your face, like a passport photo. QuikFly shows it to staff only.</p>
          <PhotoField kind="photo" has={app.hasPhoto} readOnly={readOnly} label="Your photo" onSaved={onSaved} />
        </>
      )}
      {section === "bank" && (
        <>
          <Field label="Account holder name" htmlFor={id("holder")} hint="As in your bank records">
            <input id={id("holder")} className="field" value={f.holder} onChange={set("holder")} readOnly={readOnly} autoComplete="name" />
          </Field>
          {readOnly ? (
            <p className="text-sm"><span className="text-subtle">Account number</span> •••• {app.bank?.accountLast4}</p>
          ) : (
            <>
              <Field label="Account number" htmlFor={id("account")} hint={app.bank ? `Saved account ends in ${app.bank.accountLast4}. Enter it again to change it.` : undefined}>
                <input id={id("account")} className="field" inputMode="numeric" autoComplete="off" value={f.account} onChange={set("account")} />
              </Field>
              <Field label="Confirm account number" htmlFor={id("account2")}>
                <input id={id("account2")} className="field" inputMode="numeric" autoComplete="off" value={f.account2} onChange={set("account2")} onPaste={(e) => e.preventDefault()} />
              </Field>
            </>
          )}
          <Field label="IFSC" htmlFor={id("ifsc")} hint="Your earnings are paid to this account.">
            <input id={id("ifsc")} className="field uppercase" placeholder="SBIN0001234" value={f.ifsc} onChange={set("ifsc")} readOnly={readOnly} autoCapitalize="characters" />
          </Field>
        </>
      )}
      {section === "rc" && (
        <>
          <Field label="Owner name as on the RC" htmlFor={id("owner")}>
            <input id={id("owner")} className="field" value={f.ownerName} onChange={set("ownerName")} readOnly={readOnly} />
          </Field>
          <Field label="Registration valid till" htmlFor={id("rcvalid")}>
            <input id={id("rcvalid")} type="date" className="field" min={shiftISO(today, 1)} value={f.rcValidTill} onChange={set("rcValidTill")} readOnly={readOnly} />
          </Field>
          <PhotoField kind="rc" has={!!v?.rc?.hasPhoto} readOnly={readOnly || !v} label="Photo of the RC" onSaved={onSaved} />
        </>
      )}
      {section === "insurance" && (
        <>
          <Field label="Insurance company" htmlFor={id("insurer")}>
            <input id={id("insurer")} className="field" value={f.insurer} onChange={set("insurer")} readOnly={readOnly} />
          </Field>
          <Field label="Policy number" htmlFor={id("policy")}>
            <input id={id("policy")} className="field uppercase" value={f.policyNumber} onChange={set("policyNumber")} readOnly={readOnly} autoCapitalize="characters" />
          </Field>
          <Field label="Insurance valid till" htmlFor={id("insvalid")}>
            <input id={id("insvalid")} type="date" className="field" min={shiftISO(today, 1)} value={f.insValidTill} onChange={set("insValidTill")} readOnly={readOnly} />
          </Field>
          <PhotoField kind="insurance" has={!!v?.insurance?.hasPhoto} readOnly={readOnly || !v} label="Photo of the insurance certificate" onSaved={onSaved} />
        </>
      )}
      {section === "audit" && (
        <>
          <p className="text-sm text-muted">Bring your vehicle and original documents to {settings.vendorAuditAddress}. Our team checks its condition, safety kit and papers.</p>
          <Field label="Audit day" htmlFor={id("auditday")}>
            <input id={id("auditday")} type="date" className="field" min={shiftISO(today, 1)} max={shiftISO(today, VENDOR_RULES.auditMaxDays)} value={f.auditDate} onChange={set("auditDate")} readOnly={readOnly} />
          </Field>
          <div><p className="label mb-2">Time</p>{chips<AuditSlot>("slot", AUDIT_SLOTS, (s) => AUDIT_SLOT_LABEL[s])}</div>
          {v?.audit?.result === "passed" && <p className="text-sm text-success">Audit passed.</p>}
          {v?.audit && v.audit.result === "booked" && <p className="text-xs text-subtle">Booked for {prettyDate(v.audit.date)}, {AUDIT_SLOT_LABEL[v.audit.slot].toLowerCase()}.</p>}
        </>
      )}
      {(section === "rc" || section === "insurance" || section === "audit") && !v && <p className="text-sm text-warning">Add your city and vehicle details first.</p>}
      <ErrorText>{error}</ErrorText>
      {!readOnly && section !== "photo" && <GoldButton onClick={save} loading={busy} disabled={(section !== "vehicle" && section !== "bank") && !v}>Save</GoldButton>}
    </div>
  );
}
