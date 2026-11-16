import { SPA } from "@/lib/spa-flag";
import { SpaApp } from "@/spa/SpaApp";
import { HomeScreen } from "@/screens/HomeScreen";

export default function Page() {
  return SPA ? <SpaApp /> : <HomeScreen />;
}
