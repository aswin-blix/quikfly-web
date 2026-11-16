import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmedScreen } from "@/screens/CheckoutScreens";

export const metadata: Metadata = { title: "Booking Confirmed | QuikFly", description: "Your booking is confirmed." };

export default function Page() {
  return <Suspense><ConfirmedScreen /></Suspense>;
}
