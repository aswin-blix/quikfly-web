import type { Metadata } from "next";
import { ParcelScreen } from "@/screens/ParcelScreens";

export const metadata: Metadata = { title: "Parcels | QuikFly", description: "Send a parcel between cities by bus, counter to counter." };

export default function Page() {
  return <ParcelScreen />;
}
