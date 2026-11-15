import type { Metadata } from "next";
import { CheckoutScreen } from "@/screens/CheckoutScreens";

export const metadata: Metadata = { title: "Checkout | QuikFly", description: "Review and pay." };

export default function Page() {
  return <CheckoutScreen />;
}
