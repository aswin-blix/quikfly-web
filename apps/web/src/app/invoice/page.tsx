import type { Metadata } from "next";
import { Suspense } from "react";
import { InvoiceScreen } from "@/screens/InvoiceScreen";

export const metadata: Metadata = { title: "Invoice | QuikFly", description: "Tax invoice for your booking.", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense><InvoiceScreen /></Suspense>;
}
