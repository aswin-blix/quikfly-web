import type { Metadata } from "next";
import { Suspense } from "react";
import { NotificationsScreen } from "@/screens/NotificationsScreen";

export const metadata: Metadata = { title: "Notifications | QuikFly", description: "Your bookings, refunds and ride reminders.", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense><NotificationsScreen /></Suspense>;
}
