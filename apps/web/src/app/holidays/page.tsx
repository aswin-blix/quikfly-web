import type { Metadata } from "next";
import { Suspense } from "react";
import { HolidaysScreen } from "@/screens/HolidayScreens";

export const metadata: Metadata = { title: "Holiday Packages | QuikFly", description: "Curated holiday packages across India and abroad." };

export default function Page() {
  return <Suspense><HolidaysScreen /></Suspense>;
}
