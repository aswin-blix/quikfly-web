import type { Metadata } from "next";
import { PrivacyScreen } from "@/screens/PrivacyScreen";

export const metadata: Metadata = {
  title: "Privacy notice | QuikFly",
  description: "What QuikFly collects, why, who sees it, how long it is kept, your rights and the Grievance Officer's contact.",
};

export default function Page() {
  return <PrivacyScreen />;
}
