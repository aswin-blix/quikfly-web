import type { Metadata } from "next";
import { CaptainScreen } from "@/screens/InfoScreens";

export const metadata: Metadata = { title: "Drive with QuikFly Captain | QuikFly", description: "The QuikFly Captain app for drivers: whole trip before you accept, offers read aloud, cash you can't miss." };

export default function Page() {
  return <CaptainScreen />;
}
