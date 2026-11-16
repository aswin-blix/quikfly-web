import type { Metadata } from "next";
import { Suspense } from "react";
import { RentScreen } from "@/screens/RentScreens";

export const metadata: Metadata = { title: "Rent a Car | QuikFly", description: "Self-drive and chauffeur car rentals." };

export default function Page() {
  return <Suspense><RentScreen /></Suspense>;
}
