import type { Metadata } from "next";
import { PartnerScreen } from "@/screens/InfoScreens";

export const metadata: Metadata = { title: "Become a Partner | QuikFly", description: "Drive with QuikFly and earn." };

export default function Page() {
  return <PartnerScreen />;
}
