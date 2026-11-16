import type { Metadata } from "next";
import { HelpScreen } from "@/screens/InfoScreens";

export const metadata: Metadata = { title: "Help Centre | QuikFly", description: "FAQs and support." };

export default function Page() {
  return <HelpScreen />;
}
