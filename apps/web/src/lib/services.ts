import { Bike, Bus, Car, Caravan, KeyRound, Palmtree, type LucideIcon } from "lucide-react";
import type { ServiceKey } from "@quikfly/shared";

export interface ServiceMeta {
  key: ServiceKey;
  title: string;
  action: string;
  nav: string;
  href: string;
  blurb: string;
  tagline: string;
  image: string;
  icon: LucideIcon;
}

// Service photos live in public/assets/services/ (1200 px WebP); screens reuse them via serviceByKey(...).image.
// Paths are written out in full so the single-file demo build (scripts/inline-demo.py) can find and inline them.
export const SERVICES: ServiceMeta[] = [
  { key: "bike", title: "Bike", action: "Bike Taxi", nav: "Bike Taxi", href: "/bike-taxi", tagline: "Beat the traffic", blurb: "Bikes, e-bikes & autos at your doorstep in under 5 minutes.", image: "/assets/services/bike-taxi.webp", icon: Bike },
  { key: "car", title: "Car", action: "Car Ride", nav: "Cabs", href: "/cab", tagline: "Ride in comfort", blurb: "Mini, Sedan, SUV or Prime with upfront fares and verified drivers.", image: "/assets/services/car-ride.webp", icon: Car },
  { key: "bus", title: "Travels", action: "Bus Booking", nav: "Bus", href: "/bus", tagline: "Pick your seat", blurb: "Intercity sleeper & seater buses with live seat maps.", image: "/assets/services/bus-booking.webp", icon: Bus },
  { key: "tours", title: "Holiday Trip", action: "Tour Packages", nav: "Holidays", href: "/holidays", tagline: "Curated getaways", blurb: "Handpicked holidays across India and abroad, all-inclusive.", image: "/assets/services/tour-packages.webp", icon: Palmtree },
  { key: "rent", title: "Rental Car", action: "Rent a Car", nav: "Rent a Car", href: "/rent-a-car", tagline: "Drive yourself", blurb: "Self-drive or chauffeur cars by the hour, day or week.", image: "/assets/services/rent-a-car.webp", icon: KeyRound },
  { key: "rentals", title: "Rental Trip", action: "Travel Rentals", nav: "Group Travel", href: "/travel-rentals", tagline: "Travel together", blurb: "Tempo travellers, Urbanias & coaches for family and group trips.", image: "/assets/services/travel-rentals.webp", icon: Caravan },
];

export const serviceByKey = (k: ServiceKey) => SERVICES.find((s) => s.key === k)!;
