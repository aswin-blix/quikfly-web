import type { Metadata } from "next";
import { Suspense } from "react";
import { TravelRentalsScreen } from "@/screens/TravelRentalsScreen";

export const metadata: Metadata = { title: "Group Travel Rentals | QuikFly", description: "Tempo travellers, Urbanias and coaches for groups." };

export default function Page() {
  return <Suspense><TravelRentalsScreen /></Suspense>;
}
