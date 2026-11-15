import type { Metadata } from "next";
import { OffersScreen } from "@/screens/InfoScreens";

export const metadata: Metadata = { title: "Offers & Coupons | QuikFly", description: "Latest QuikFly offers." };

export default function Page() {
  return <OffersScreen />;
}
