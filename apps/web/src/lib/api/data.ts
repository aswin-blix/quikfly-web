// Website-only content: marketing offers, coupons, route shortcuts and FAQs.
// Catalog data (places, rides, buses, tours, rentals) lives in @quikfly/shared.
import type { Faq, Offer } from "@quikfly/shared";

export const OFFERS: Offer[] = [
  { id: "o1", code: "QUIKFLY50", title: "50% off your first 3 rides", description: "Bike & car rides. Max ₹75 off per ride.", service: "car", hue: 45 },
  { id: "o2", code: "BUS150", title: "Flat ₹150 off bus tickets", description: "On bookings above ₹999. All operators.", service: "bus", hue: 0 },
  { id: "o3", code: "HOLIDAY10", title: "10% off holiday packages", description: "Up to ₹5,000 off domestic & international trips.", service: "tours", hue: 190 },
  { id: "o4", code: "DRIVE20", title: "20% off self-drive rentals", description: "Weekday rentals of 24 hours or more.", service: "rent", hue: 270 },
  { id: "o5", code: "GROUP500", title: "₹500 off group travel", description: "Tempo traveller & coach bookings.", service: "rentals", hue: 140 },
  { id: "o6", code: "EBIKE", title: "30% off E-Bike rides", description: "Go green on short city hops. Max ₹40 off.", service: "bike", hue: 100 },
];

export const COUPONS: Record<string, { pct: number; max: number; service: string }> = {
  QUIKFLY50: { pct: 50, max: 75, service: "car" }, BUS150: { pct: 100, max: 150, service: "bus" },
  HOLIDAY10: { pct: 10, max: 5000, service: "tours" }, DRIVE20: { pct: 20, max: 2000, service: "rent" },
  GROUP500: { pct: 100, max: 500, service: "rentals" }, EBIKE: { pct: 30, max: 40, service: "bike" },
};

export const POPULAR_ROUTES: [string, string][] = [
  ["Chennai", "Bengaluru"], ["Chennai", "Coimbatore"], ["Chennai", "Madurai"], ["Bengaluru", "Hyderabad"],
  ["Chennai", "Pondicherry"], ["Coimbatore", "Kochi"], ["Trichy", "Chennai"], ["Madurai", "Bengaluru"],
];

export const FAQS: Faq[] = [
  { category: "Rides", q: "How is my ride fare calculated?", a: "Base fare + per-km + per-minute charges, shown upfront before you book. Peak hours may add a small surge which is always displayed." },
  { category: "Rides", q: "What is the ride OTP?", a: "A 4-digit code you share with the driver at pickup so the trip starts only for you." },
  { category: "Rides", q: "Do bike taxis provide a helmet?", a: "Yes. Every QuikFly captain carries a clean pillion helmet." },
  { category: "Bus", q: "Can I choose my seat?", a: "Yes. Open any bus to see the live seat layout, choose seats or berths, then pick boarding and dropping points." },
  { category: "Bus", q: "What are ladies seats?", a: "Seats marked pink are reserved for women travellers for safety and comfort." },
  { category: "Holidays", q: "Can I customise a holiday package?", a: "Yes. Book the base package and our travel expert will call you within 2 hours to customise hotels and activities." },
  { category: "Rentals", q: "What documents do I need for self-drive?", a: "A valid driving licence (held for at least 1 year) and Aadhaar or passport. Upload once, use forever." },
  { category: "Rentals", q: "Is there a km limit on rentals?", a: "Choose a limited plan (140 km/day, cheaper) or an unlimited km plan. Extra km on limited plans are billed per km." },
  { category: "Payments", q: "Which payment methods are accepted?", a: "UPI, debit/credit cards, net banking, QuikFly wallet and cash for rides." },
  { category: "Payments", q: "How long do refunds take?", a: "Wallet refunds are instant. UPI and card refunds reach your account in 3–5 working days." },
  { category: "Account", q: "How do I log in?", a: "Use your mobile number. We send a one-time password — no passwords to remember." },
];
