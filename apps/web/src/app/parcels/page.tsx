import type { Metadata } from "next";
import { ParcelScreen } from "@/screens/ParcelScreens";

export const metadata: Metadata = { title: "Parcels | QuikFly", description: "Send a parcel across Chennai with a captain, or between cities by bus." };

export default function Page() {
  return <ParcelScreen />;
}
