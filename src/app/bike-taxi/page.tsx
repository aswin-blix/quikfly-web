import type { Metadata } from "next";
import { Suspense } from "react";
import { RideScreen } from "@/screens/RideScreen";

export const metadata: Metadata = { title: "Bike Taxi & Autos | QuikFly", description: "Book bike taxis and autos in minutes with upfront fares." };

export default function Page() {
  return <Suspense><RideScreen service="bike" /></Suspense>;
}
