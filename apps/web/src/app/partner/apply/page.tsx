import type { Metadata } from "next";
import { PartnerApplyScreen } from "@/screens/PartnerApplyScreen";

export const metadata: Metadata = { title: "Partner application | QuikFly", description: "Register your cab, auto, tempo traveller or bus with QuikFly and onboard online." };

export default function Page() {
  return <PartnerApplyScreen />;
}
