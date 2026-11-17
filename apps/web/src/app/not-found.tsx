"use client";
// The host serves this page for any address it has no file for. Holidays and rental cars
// added in the admin panel after the last build have no pre-built page, so their addresses
// land here: render the detail screen, which loads the item from the API. Everything else
// gets the normal "not found" screen.
import { Suspense, useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { HolidayDetailScreen } from "@/screens/HolidayScreens";
import { NotFoundScreen } from "@/screens/InfoScreens";
import { RentDetailScreen } from "@/screens/RentScreens";

export default function NotFound() {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => setPath(location.pathname.replace(/\/$/, "")), []);

  if (path === null) return <div className="py-32 grid place-items-center text-gold"><Spinner size={26} /></div>;
  const tour = path.match(/^\/holidays\/([\w-]+)$/);
  if (tour) return <HolidayDetailScreen slug={tour[1]} />;
  const car = path.match(/^\/rent-a-car\/([\w-]+)$/);
  if (car) return <Suspense><RentDetailScreen id={car[1]} /></Suspense>;
  return <NotFoundScreen />;
}
