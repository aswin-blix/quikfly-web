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

export const SERVICES: ServiceMeta[] = [
  { key: "bike", title: "Bike", action: "Bike Taxi", nav: "Bike Taxi", href: "/bike-taxi", tagline: "Beat the traffic", blurb: "Bikes, e-bikes & autos at your doorstep in under 5 minutes.", image: "/assets/s0.jpg", icon: Bike },
  { key: "car", title: "Car", action: "Car Ride", nav: "Cabs", href: "/cab", tagline: "Ride in comfort", blurb: "Mini, Sedan, SUV or Prime with upfront fares and verified drivers.", image: "/assets/s1.jpg", icon: Car },
  { key: "bus", title: "Travels", action: "Bus Booking", nav: "Bus", href: "/bus", tagline: "Pick your seat", blurb: "Intercity sleeper & seater buses with live seat maps.", image: "/assets/s2.jpg", icon: Bus },
  { key: "tours", title: "Holiday Trip", action: "Tour Packages", nav: "Holidays", href: "/holidays", tagline: "Curated getaways", blurb: "Handpicked holidays across India and abroad, all-inclusive.", image: "/assets/s3.jpg", icon: Palmtree },
  { key: "rent", title: "Rental Car", action: "Rent a Car", nav: "Rent a Car", href: "/rent-a-car", tagline: "Drive yourself", blurb: "Self-drive or chauffeur cars by the hour, day or week.", image: "/assets/s4.jpg", icon: KeyRound },
  { key: "rentals", title: "Rental Trip", action: "Travel Rentals", nav: "Group Travel", href: "/travel-rentals", tagline: "Travel together", blurb: "Tempo travellers, Urbanias & coaches for family and group trips.", image: "/assets/s5.jpg", icon: Caravan },
];

export const serviceByKey = (k: ServiceKey) => SERVICES.find((s) => s.key === k)!;
