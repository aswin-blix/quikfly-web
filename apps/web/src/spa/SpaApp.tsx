"use client";
// Single-file demo build: same screens, routed in memory (see lib/nav.tsx).
import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { PageTransition, Shell } from "@/components/shell";
import { SpaNavProvider, usePath } from "@/lib/nav";
import { ScrollTrigger } from "@/lib/gsap";
import { HomeScreen } from "@/screens/HomeScreen";
import { RideScreen } from "@/screens/RideScreen";
import { BusResultsScreen, BusScreen } from "@/screens/BusScreens";
import { HolidayDetailScreen, HolidaysScreen } from "@/screens/HolidayScreens";
import { RentDetailScreen, RentScreen } from "@/screens/RentScreens";
import { TravelRentalsScreen } from "@/screens/TravelRentalsScreen";
import { BookingsScreen, CheckoutScreen, ConfirmedScreen } from "@/screens/CheckoutScreens";
import { HelpScreen, NotFoundScreen, OffersScreen, PartnerScreen } from "@/screens/InfoScreens";
import { PrivacyScreen } from "@/screens/PrivacyScreen";
import { AccountScreen } from "@/screens/AccountScreen";
import { TrackScreen } from "@/screens/TrackScreen";
import { TicketScreen } from "@/screens/TicketScreen";
import { PartnerApplyScreen } from "@/screens/PartnerApplyScreen";
import { InvoiceScreen } from "@/screens/InvoiceScreen";
import { TripScreen } from "@/screens/TripScreen";
import { NotificationsScreen } from "@/screens/NotificationsScreen";

const ROUTES: [RegExp, (m: RegExpMatchArray) => React.ReactNode][] = [
  [/^\/$/, () => <HomeScreen />],
  [/^\/bike-taxi$/, () => <RideScreen service="bike" />],
  [/^\/cab$/, () => <RideScreen service="car" />],
  [/^\/bus$/, () => <BusScreen />],
  [/^\/bus\/search$/, () => <BusResultsScreen />],
  [/^\/holidays$/, () => <HolidaysScreen />],
  [/^\/holidays\/([\w-]+)$/, (m) => <HolidayDetailScreen slug={m[1]} />],
  [/^\/rent-a-car$/, () => <RentScreen />],
  [/^\/rent-a-car\/([\w-]+)$/, (m) => <RentDetailScreen id={m[1]} />],
  [/^\/travel-rentals$/, () => <TravelRentalsScreen />],
  [/^\/checkout$/, () => <CheckoutScreen />],
  [/^\/booking-confirmed$/, () => <ConfirmedScreen />],
  [/^\/bookings$/, () => <BookingsScreen />],
  [/^\/offers$/, () => <OffersScreen />],
  [/^\/partner$/, () => <PartnerScreen />],
  [/^\/help$/, () => <HelpScreen />],
  [/^\/privacy$/, () => <PrivacyScreen />],
  [/^\/account$/, () => <AccountScreen />],
  [/^\/track$/, () => <TrackScreen />],
  [/^\/ticket$/, () => <TicketScreen />],
  [/^\/partner\/apply$/, () => <PartnerApplyScreen />],
  [/^\/invoice$/, () => <InvoiceScreen />],
  [/^\/trip$/, () => <TripScreen />],
  [/^\/notifications$/, () => <NotificationsScreen />],
];

function Router() {
  const path = usePath();
  useEffect(() => { const t = setTimeout(() => ScrollTrigger.refresh(), 600); return () => clearTimeout(t); }, [path]);
  let node: React.ReactNode = <NotFoundScreen />;
  for (const [re, render] of ROUTES) {
    const m = path.match(re);
    if (m) { node = render(m); break; }
  }
  return <AnimatePresence mode="wait"><PageTransition key={path} k={path}>{node}</PageTransition></AnimatePresence>;
}

/** Rendered at "/" in the SPA build; the layout supplies SpaNavProvider + Shell. */
export function SpaApp() {
  return <Router />;
}

export function SpaFrame({ children }: { children: React.ReactNode }) {
  return <SpaNavProvider><Shell>{children}</Shell></SpaNavProvider>;
}
