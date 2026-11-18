import type { Metadata } from "next";
import { Suspense } from "react";
import { TripScreen } from "@/screens/TripScreen";

export const metadata: Metadata = { title: "Trip summary | QuikFly", description: "All the bookings of one trip.", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense><TripScreen /></Suspense>;
}
