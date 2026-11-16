import type { Metadata } from "next";
import { Suspense } from "react";
import { RENTAL_CARS } from "@quikfly/shared";
import { RentDetailScreen } from "@/screens/RentScreens";

export const dynamicParams = false;
export function generateStaticParams() {
  return RENTAL_CARS.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = RENTAL_CARS.find((x) => x.id === id);
  return { title: `Rent ${c?.name ?? "a car"} | QuikFly` };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense><RentDetailScreen id={id} /></Suspense>;
}
