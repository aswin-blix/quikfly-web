import type { Metadata } from "next";
import { Suspense } from "react";
import { RideScreen } from "@/screens/RideScreen";

export const metadata: Metadata = { title: "Book a Cab | QuikFly", description: "Mini, Sedan, SUV and Prime cabs with verified drivers." };

export default function Page() {
  return <Suspense><RideScreen service="car" /></Suspense>;
}
