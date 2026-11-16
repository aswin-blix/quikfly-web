import type { Metadata } from "next";
import { Suspense } from "react";
import { BusResultsScreen } from "@/screens/BusScreens";

export const metadata: Metadata = { title: "Bus Search Results | QuikFly", description: "Compare buses, timings and seats." };

export default function Page() {
  return <Suspense><BusResultsScreen /></Suspense>;
}
