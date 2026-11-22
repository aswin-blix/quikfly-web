import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackParcelScreen } from "@/screens/TrackParcelScreen";

// Tracking links are for whoever has the LR number: keep them out of search results.
export const metadata: Metadata = { title: "Track a parcel | QuikFly", description: "Follow a QuikFly parcel by LR number.", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense><TrackParcelScreen /></Suspense>;
}
