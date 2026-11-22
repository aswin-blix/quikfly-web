"use client";
// A QR code of a parcel's public tracking page, for receipts and the sender's screen.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QR_COLORS } from "@/lib/account";
import { cx } from "@/lib/format";
import { parcelTrackUrl } from "@/lib/parcels";

export function ParcelQr({ lr, className }: { lr: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(parcelTrackUrl(lr), { type: "svg", margin: 1, color: QR_COLORS }).then(setSvg, () => setSvg(""));
  }, [lr]);
  if (!svg) return null;
  return <div className={cx("w-28 h-28 shrink-0 rounded-lg overflow-hidden", className)} role="img" aria-label={`QR code to track parcel ${lr}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
