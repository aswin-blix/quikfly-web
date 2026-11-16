import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountScreen } from "@/screens/AccountScreen";

export const metadata: Metadata = { title: "My account | QuikFly", description: "Profile, wallet, saved places, travellers and safety settings." };

export default function Page() {
  return <Suspense><AccountScreen /></Suspense>;
}
