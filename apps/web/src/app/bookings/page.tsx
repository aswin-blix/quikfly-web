import type { Metadata } from "next";
import { BookingsScreen } from "@/screens/CheckoutScreens";

export const metadata: Metadata = { title: "My Trips | QuikFly", description: "Your bookings." };

export default function Page() {
  return <BookingsScreen />;
}
