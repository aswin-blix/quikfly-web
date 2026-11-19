// Catalog SEED data. The live catalog is in the API's D1 `catalog_items` table, edited in the
// admin panel; the API copies this seed in on first use and on "reset catalog". The website's
// offline demo (mock API) uses it as its catalog, and the website pre-builds detail pages for
// these slugs/ids. Never read it for live data in the apps: use GET /config and the catalog endpoints.
import type {
  BusOperator, City, DriverProfile, Faq, GroupDestination, Offer, Place, PopularRoute, RentalCar, RideOption, TourPackage, TravelVehicle,
} from "./types";

/**
 * Bus boarding points (as the timetable names them) that are also places on the ride map,
 * so a bus booking can offer a ride to its boarding point. Demo city: Chennai.
 */
export const BOARDING_POINT_PLACES: Record<string, string> = {
  "Chennai – Main Bus Stand": "p14",
  "Chennai – City Center": "p1",
  "Chennai – Bypass": "p11",
};

export const PLACES: Place[] = [
  { id: "p1", name: "Chennai Central", area: "Park Town", x: 62, y: 30 },
  { id: "p2", name: "Chennai Airport (MAA)", area: "Meenambakkam", x: 30, y: 82 },
  { id: "p3", name: "T. Nagar", area: "Thyagaraya Nagar", x: 44, y: 52 },
  { id: "p4", name: "Marina Beach", area: "Triplicane", x: 80, y: 44 },
  { id: "p5", name: "Anna Nagar Tower Park", area: "Anna Nagar", x: 36, y: 24 },
  { id: "p6", name: "Phoenix MarketCity", area: "Velachery", x: 56, y: 76 },
  { id: "p7", name: "Guindy Metro", area: "Guindy", x: 42, y: 66 },
  { id: "p8", name: "Adyar Signal", area: "Adyar", x: 70, y: 64 },
  { id: "p9", name: "Sholinganallur IT Park", area: "OMR", x: 82, y: 90 },
  { id: "p10", name: "Egmore Station", area: "Egmore", x: 58, y: 36 },
  { id: "p11", name: "Porur Junction", area: "Porur", x: 16, y: 56 },
  { id: "p12", name: "Tambaram Station", area: "Tambaram", x: 22, y: 96 },
  { id: "p13", name: "Express Avenue Mall", area: "Royapettah", x: 68, y: 42 },
  { id: "p14", name: "Koyambedu Bus Terminus", area: "Koyambedu", x: 26, y: 38 },
];

export const RIDE_OPTIONS: RideOption[] = [
  { id: "bike", service: "bike", name: "Bike", description: "Beat the traffic, solo rides", seats: 1, baseFare: 20, perKm: 6, perMin: 0.5, models: ["Honda Activa 6G", "TVS Jupiter", "Bajaj Pulsar 150"] },
  { id: "ebike", service: "bike", name: "E-Bike", description: "Electric, zero emissions", seats: 1, baseFare: 18, perKm: 5.5, perMin: 0.5, models: ["Ather 450X", "Ola S1 Pro"] },
  { id: "pink", service: "bike", name: "Bike Pink", description: "Women riders, women captains", seats: 1, baseFare: 20, perKm: 6, perMin: 0.5, models: ["Honda Activa 6G", "TVS Jupiter"], riders: "women" },
  { id: "auto", service: "bike", name: "Auto", description: "Doorstep three-wheeler", seats: 3, baseFare: 30, perKm: 13, perMin: 0.8, models: ["Bajaj RE Compact"] },
  { id: "mini", service: "car", name: "Mini", description: "Compact hatchbacks, best value", seats: 4, baseFare: 50, perKm: 14, perMin: 1.2, models: ["Maruti Swift", "Hyundai i20"] },
  { id: "sedan", service: "car", name: "Sedan", description: "Spacious sedans, extra boot", seats: 4, baseFare: 60, perKm: 16, perMin: 1.5, models: ["Maruti Dzire", "Honda Amaze", "Hyundai Aura"] },
  { id: "suv", service: "car", name: "SUV", description: "6 seats for family & groups", seats: 6, baseFare: 90, perKm: 21, perMin: 2, models: ["Toyota Innova Crysta", "Maruti Ertiga"] },
  { id: "prime", service: "car", name: "Prime", description: "Top-rated drivers, premium cars", seats: 4, baseFare: 110, perKm: 24, perMin: 2.2, models: ["Toyota Camry", "Honda City Hybrid"] },
];

export const DRIVERS: DriverProfile[] = [
  { id: "d1", name: "Murugan K", rating: 4.9, trips: 3120, phone: "+91 98400 12345", gender: "male" },
  { id: "d2", name: "Ravi Shankar", rating: 4.8, trips: 1876, phone: "+91 98410 22334", gender: "male" },
  { id: "d3", name: "Senthil Kumar", rating: 4.7, trips: 2540, phone: "+91 97890 44556", gender: "male" },
  { id: "d4", name: "Arjun P", rating: 4.9, trips: 980, phone: "+91 90030 77889", gender: "male" },
  { id: "d5", name: "Lakshmi R", rating: 4.9, trips: 1240, phone: "+91 98840 55621", gender: "female" },
  { id: "d6", name: "Priya S", rating: 4.8, trips: 860, phone: "+91 97100 33417", gender: "female" },
];

export const CITIES: City[] = [
  { id: "c1", name: "Chennai" },
  { id: "c2", name: "Bengaluru" },
  { id: "c3", name: "Coimbatore" },
  { id: "c4", name: "Madurai" },
  { id: "c5", name: "Hyderabad" },
  { id: "c6", name: "Pondicherry" },
  { id: "c7", name: "Trichy" },
  { id: "c8", name: "Kochi" },
];

export const BUS_OPERATORS: BusOperator[] = [
  { id: "bo1", name: "QuikFly Travels" },
  { id: "bo2", name: "SRS Travels" },
  { id: "bo3", name: "KPN Travels" },
  { id: "bo4", name: "Parveen Travels" },
  { id: "bo5", name: "Orange Tours" },
  { id: "bo6", name: "YBM Travels" },
  { id: "bo7", name: "IntrCity SmartBus" },
];

export const TOURS: TourPackage[] = [
  {
    id: "t1", slug: "munnar-alleppey", themes: ["hills"], hotelStars: 3, meals: "Breakfast & dinner",
    title: "Munnar & Alleppey Escape", location: "Kerala", days: 5, nights: 4, price: 18999, rating: 4.8, tag: "Bestseller", hue: 140,
    highlights: ["Tea estate walk", "Houseboat stay", "Eravikulam park"],
    includes: ["Hotels", "Breakfast", "Private cab", "Sightseeing"],
    itinerary: ["Arrive Kochi, drive to Munnar", "Munnar sightseeing & tea museum", "Drive to Thekkady, spice plantation", "Alleppey houseboat overnight", "Return to Kochi, departure"],
  },
  {
    id: "t2", slug: "goa-beach-holiday", themes: ["beach"], hotelStars: 4, meals: "Breakfast",
    title: "Goa Beach Holiday", location: "Goa", days: 4, nights: 3, price: 14499, rating: 4.6, tag: "Trending", hue: 30,
    highlights: ["North & South Goa tour", "Sunset cruise", "Old Goa churches"],
    includes: ["Resort", "Breakfast", "Airport transfer", "Cruise"],
    itinerary: ["Arrive, check-in, beach evening", "North Goa: forts & beaches", "South Goa & Mandovi sunset cruise", "Departure"],
  },
  {
    id: "t3", slug: "ooty-kodaikanal", themes: ["hills"], hotelStars: 3, meals: "Breakfast & dinner",
    title: "Ooty – Kodaikanal Hills", location: "Tamil Nadu", days: 4, nights: 3, price: 11999, rating: 4.7, hue: 100,
    highlights: ["Nilgiri toy train", "Botanical garden", "Kodai lake boating"],
    includes: ["Hotels", "Breakfast & dinner", "Cab from Chennai"],
    itinerary: ["Drive to Ooty, evening at lake", "Toy train & Doddabetta peak", "Drive to Kodaikanal", "Kodai sightseeing, return"],
  },
  {
    id: "t4", slug: "andaman-explorer", themes: ["beach"], hotelStars: 4, meals: "Breakfast",
    title: "Andaman Island Explorer", location: "Port Blair · Havelock", days: 6, nights: 5, price: 32999, rating: 4.9, tag: "Premium", hue: 190,
    highlights: ["Radhanagar beach", "Scuba at Havelock", "Cellular jail light show"],
    includes: ["Flights from Chennai", "Hotels", "Ferry tickets", "Breakfast"],
    itinerary: ["Fly to Port Blair, Cellular Jail", "Ferry to Havelock", "Radhanagar beach & scuba", "Neil island day trip", "Back to Port Blair, shopping", "Departure"],
  },
  {
    id: "t5", slug: "dubai-city-lights", themes: ["international"], hotelStars: 4, meals: "Breakfast",
    title: "Dubai City Lights", location: "UAE", days: 5, nights: 4, price: 54999, rating: 4.7, tag: "International", hue: 45,
    highlights: ["Burj Khalifa 124th floor", "Desert safari", "Dhow cruise dinner"],
    includes: ["Return flights", "Visa", "4★ hotel", "Transfers"],
    itinerary: ["Arrive Dubai, dhow cruise", "City tour & Burj Khalifa", "Desert safari with BBQ", "Abu Dhabi day trip", "Departure"],
  },
  {
    id: "t6", slug: "pondicherry-weekend", themes: ["weekend","heritage"], hotelStars: 3, meals: "Breakfast",
    title: "Pondicherry Weekend", location: "Puducherry", days: 2, nights: 1, price: 4999, rating: 4.5, hue: 210,
    highlights: ["French quarter walk", "Auroville", "Paradise beach"],
    includes: ["Boutique stay", "Breakfast", "AC cab from Chennai"],
    itinerary: ["ECR drive, French quarter & promenade", "Auroville, Paradise beach, return"],
  },
  {
    id: "t7", slug: "mysore-coorg", themes: ["hills", "heritage"], hotelStars: 4, meals: "Breakfast",
    title: "Mysore & Coorg Retreat", location: "Karnataka", days: 4, nights: 3, price: 13999, rating: 4.6, hue: 120,
    highlights: ["Mysore Palace", "Coffee estate stay", "Abbey Falls"],
    includes: ["Hotels", "Breakfast", "Private cab", "Sightseeing"],
    itinerary: ["Drive to Mysore, palace light show", "Chamundi hills, drive to Coorg", "Abbey Falls, Raja's Seat, coffee walk", "Dubare elephant camp, return"],
  },
  {
    id: "t8", slug: "bali-island-bliss", themes: ["international", "beach"], hotelStars: 4, meals: "Breakfast",
    title: "Bali Island Bliss", location: "Indonesia", days: 6, nights: 5, price: 62999, rating: 4.8, tag: "Honeymoon pick", hue: 165,
    highlights: ["Ubud rice terraces", "Nusa Penida day trip", "Uluwatu sunset"],
    includes: ["Return flights", "Visa on arrival", "Villa stay", "Transfers"],
    itinerary: ["Arrive Bali, Kuta beach", "Ubud: monkey forest & rice terraces", "Kintamani volcano view", "Nusa Penida island tour", "Uluwatu temple & sunset", "Departure"],
  },
];

export const RENTAL_CARS: RentalCar[] = [
  { id: "rc1", name: "Maruti Swift", category: "Hatchback", seats: 5, transmission: "Manual", fuel: "Petrol", pricePerHour: 89, driverPerDay: 800, rating: 4.7, trips: 412, year: 2023, features: ["Bluetooth", "Rear camera"] },
  { id: "rc2", name: "Hyundai i20", category: "Hatchback", seats: 5, transmission: "Automatic", fuel: "Petrol", pricePerHour: 109, driverPerDay: 800, rating: 4.8, trips: 287, year: 2024, features: ["Sunroof", "Apple CarPlay"] },
  { id: "rc3", name: "Honda City", category: "Sedan", seats: 5, transmission: "Automatic", fuel: "Petrol", pricePerHour: 139, driverPerDay: 900, rating: 4.8, trips: 356, year: 2023, features: ["Cruise control", "Android Auto"] },
  { id: "rc4", name: "Hyundai Creta", category: "SUV", seats: 5, transmission: "Automatic", fuel: "Diesel", pricePerHour: 169, driverPerDay: 1000, rating: 4.9, trips: 521, year: 2024, features: ["Panoramic sunroof", "Ventilated seats"] },
  { id: "rc5", name: "Toyota Innova Crysta", category: "MUV", seats: 7, transmission: "Manual", fuel: "Diesel", pricePerHour: 199, driverPerDay: 1000, rating: 4.8, trips: 640, year: 2023, features: ["Captain seats", "Rear AC"] },
  { id: "rc6", name: "Mahindra XUV700", category: "SUV", seats: 7, transmission: "Automatic", fuel: "Diesel", pricePerHour: 219, driverPerDay: 1100, rating: 4.9, trips: 198, year: 2024, features: ["ADAS", "Panoramic sunroof"] },
  { id: "rc7", name: "Tata Nexon EV", category: "SUV", seats: 5, transmission: "Automatic", fuel: "EV", pricePerHour: 129, driverPerDay: 900, rating: 4.7, trips: 233, year: 2024, features: ["Fast charging", "Connected car"] },
  { id: "rc8", name: "Toyota Fortuner", category: "Luxury", seats: 7, transmission: "Automatic", fuel: "Diesel", pricePerHour: 349, driverPerDay: 1300, rating: 4.9, trips: 145, year: 2024, features: ["4x4", "Premium audio"] },
];

export const TRAVEL_VEHICLES: TravelVehicle[] = [
  // Outstation cabs (also added to existing databases by migration 0012).
  { id: "tv6", name: "Sedan (Swift Dzire or similar)", seats: 4, perKm: 12, minKmPerDay: 250, driverBataPerDay: 300, localPackage: 2000, features: ["AC", "Boot for 2 bags", "Outstation cab"] },
  { id: "tv7", name: "SUV (Maruti Ertiga or similar)", seats: 6, perKm: 15, minKmPerDay: 250, driverBataPerDay: 350, localPackage: 2400, features: ["AC", "Roof carrier", "Outstation cab"] },
  { id: "tv1", name: "Innova Crysta", seats: 7, perKm: 19, minKmPerDay: 250, driverBataPerDay: 400, localPackage: 2800, features: ["AC", "Push-back seats", "Carrier"] },
  { id: "tv2", name: "Tempo Traveller 12-seater", seats: 12, perKm: 24, minKmPerDay: 250, driverBataPerDay: 500, localPackage: 3800, features: ["AC", "Pushback", "Music system"] },
  { id: "tv3", name: "Force Urbania 17-seater", seats: 17, perKm: 32, minKmPerDay: 300, driverBataPerDay: 600, localPackage: 5500, features: ["AC", "Recliners", "USB charging", "LED TV"] },
  { id: "tv4", name: "Mini Bus 26-seater", seats: 26, perKm: 42, minKmPerDay: 300, driverBataPerDay: 700, localPackage: 7500, features: ["AC", "Mic & speakers", "Luggage boot"] },
  { id: "tv5", name: "Luxury Coach 45-seater", seats: 45, perKm: 65, minKmPerDay: 300, driverBataPerDay: 900, localPackage: 12000, features: ["AC", "Recliners", "Washroom", "LED TV"] },
];

export const POPULAR_ROUTES: PopularRoute[] = [
  { id: "r1", from: "Chennai", to: "Bengaluru" }, { id: "r2", from: "Chennai", to: "Coimbatore" },
  { id: "r3", from: "Chennai", to: "Madurai" }, { id: "r4", from: "Bengaluru", to: "Hyderabad" },
  { id: "r5", from: "Chennai", to: "Pondicherry" }, { id: "r6", from: "Coimbatore", to: "Kochi" },
  { id: "r7", from: "Trichy", to: "Chennai" }, { id: "r8", from: "Madurai", to: "Bengaluru" },
];

/** Group-travel destinations with the one-way road distance from Chennai. */
export const GROUP_DESTINATIONS: GroupDestination[] = [
  { id: "g1", name: "Mahabalipuram", km: 60 }, { id: "g2", name: "Pondicherry", km: 150 }, { id: "g3", name: "Tirupati", km: 140 },
  { id: "g4", name: "Vellore", km: 140 }, { id: "g5", name: "Yelagiri", km: 230 }, { id: "g6", name: "Bengaluru", km: 350 },
  { id: "g7", name: "Madurai", km: 460 }, { id: "g8", name: "Ooty", km: 560 }, { id: "g9", name: "Kodaikanal", km: 530 },
];

export const OFFERS: Offer[] = [
  { id: "o1", code: "QUIKFLY50", title: "50% off your first 3 rides", description: "Cab rides. Max ₹75 off per ride.", service: "car", hue: 45, percent: 50, maxDiscount: 75, minAmount: 0, validUntil: null, perUserLimit: 3 },
  { id: "o2", code: "BUS150", title: "Flat ₹150 off bus tickets", description: "On bookings above ₹999. All operators.", service: "bus", hue: 0, percent: 100, maxDiscount: 150, minAmount: 999, validUntil: null, perUserLimit: null },
  { id: "o3", code: "HOLIDAY10", title: "10% off holiday packages", description: "Up to ₹5,000 off domestic & international trips.", service: "tours", hue: 190, percent: 10, maxDiscount: 5000, minAmount: 0, validUntil: null, perUserLimit: null },
  { id: "o4", code: "DRIVE20", title: "20% off self-drive rentals", description: "Up to ₹2,000 off car rentals.", service: "rent", hue: 270, percent: 20, maxDiscount: 2000, minAmount: 0, validUntil: null, perUserLimit: null },
  { id: "o5", code: "GROUP500", title: "₹500 off group travel", description: "Tempo traveller & coach bookings.", service: "rentals", hue: 140, percent: 100, maxDiscount: 500, minAmount: 0, validUntil: null, perUserLimit: null },
  { id: "o6", code: "EBIKE", title: "30% off bike rides", description: "Go green on short city hops. Max ₹40 off.", service: "bike", hue: 100, percent: 30, maxDiscount: 40, minAmount: 0, validUntil: null, perUserLimit: null },
];

export const FAQS: Faq[] = [
  { id: "f1", category: "Rides", q: "How is my ride fare calculated?", a: "Base fare + per-km + per-minute charges, shown upfront before you book. Peak hours may add a small surge which is always displayed." },
  { id: "f2", category: "Rides", q: "What is the ride OTP?", a: "A 4-digit code you share with the driver at pickup so the trip starts only for you." },
  { id: "f3", category: "Rides", q: "Do bike taxis provide a helmet?", a: "Yes. Every QuikFly captain carries a clean pillion helmet." },
  { id: "f4", category: "Bus", q: "Can I choose my seat?", a: "Yes. Open any bus to see the live seat layout, choose seats or berths, then pick boarding and dropping points." },
  { id: "f5", category: "Bus", q: "What are ladies seats?", a: "Seats marked pink are reserved for women travellers for safety and comfort." },
  { id: "f6", category: "Holidays", q: "Can I customise a holiday package?", a: "Not online yet. Pick the start date and travellers on the package page; for changes to hotels or activities, call support after booking." },
  { id: "f7", category: "Rentals", q: "What documents do I need for self-drive?", a: "A valid driving licence (held for at least 1 year) and Aadhaar or passport. Upload once, use forever." },
  { id: "f8", category: "Rentals", q: "Is there a km limit on rentals?", a: "Choose a limited plan (140 km/day, cheaper) or an unlimited km plan. Extra km on limited plans are billed per km." },
  { id: "f9", category: "Payments", q: "Which payment methods are accepted?", a: "UPI, debit/credit cards, net banking, QuikFly wallet and cash for rides." },
  { id: "f10", category: "Payments", q: "How long do refunds take?", a: "Refunds follow each service's cancellation policy, shown before you book and before you cancel. Wallet refunds are instant. Online payments are simulated in this preview, so nothing is charged to UPI or cards." },
  { id: "f11", category: "Account", q: "How do I log in?", a: "Use your mobile number. We send a one-time password, so there are no passwords to remember." },
];
