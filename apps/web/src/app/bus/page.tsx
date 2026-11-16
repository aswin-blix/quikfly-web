import type { Metadata } from "next";
import { BusScreen } from "@/screens/BusScreens";

export const metadata: Metadata = { title: "Bus Tickets | QuikFly", description: "Book intercity bus tickets with live seat maps." };

export default function Page() {
  return <BusScreen />;
}
