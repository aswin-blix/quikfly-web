// Catalog seed data shared by the API (served from it) and the website (static pages, demo mode).
// Move to database tables when an admin panel exists.
import type { Place, RentalCar, RideOption, TourPackage, TravelVehicle } from "./types";

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
  { id: "bike", service: "bike", name: "Bike", description: "Beat the traffic, solo rides", seats: 1, baseFare: 20, perKm: 6, perMin: 0.5 },
  { id: "ebike", service: "bike", name: "E-Bike", description: "Electric, zero emissions", seats: 1, baseFare: 18, perKm: 5.5, perMin: 0.5 },
  { id: "auto", service: "bike", name: "Auto", description: "Doorstep three-wheeler", seats: 3, baseFare: 30, perKm: 13, perMin: 0.8 },
  { id: "mini", service: "car", name: "Mini", description: "Compact hatchbacks, best value", seats: 4, baseFare: 50, perKm: 14, perMin: 1.2 },
  { id: "sedan", service: "car", name: "Sedan", description: "Spacious sedans, extra boot", seats: 4, baseFare: 60, perKm: 16, perMin: 1.5 },
  { id: "suv", service: "car", name: "SUV", description: "6 seats for family & groups", seats: 6, baseFare: 90, perKm: 21, perMin: 2 },
  { id: "prime", service: "car", name: "Prime", description: "Top-rated drivers, premium cars", seats: 4, baseFare: 110, perKm: 24, perMin: 2.2 },
];

export const DRIVERS = [
  { name: "Murugan K", rating: 4.9, trips: 3120, phone: "+91 98400 12345" },
  { name: "Ravi Shankar", rating: 4.8, trips: 1876, phone: "+91 98410 22334" },
  { name: "Senthil Kumar", rating: 4.7, trips: 2540, phone: "+91 97890 44556" },
  { name: "Arjun P", rating: 4.9, trips: 980, phone: "+91 90030 77889" },
];

export const VEHICLES: Record<string, string[]> = {
  bike: ["Honda Activa 6G", "TVS Jupiter", "Bajaj Pulsar 150"],
  ebike: ["Ather 450X", "Ola S1 Pro"],
  auto: ["Bajaj RE Compact"],
  mini: ["Maruti Swift", "Hyundai i20"],
  sedan: ["Maruti Dzire", "Honda Amaze", "Hyundai Aura"],
  suv: ["Toyota Innova Crysta", "Maruti Ertiga"],
  prime: ["Toyota Camry", "Honda City Hybrid"],
};

export const CITIES = ["Chennai", "Bengaluru", "Coimbatore", "Madurai", "Hyderabad", "Pondicherry", "Trichy", "Kochi"];

export const BUS_OPERATORS = [
  "QuikFly Travels", "SRS Travels", "KPN Travels", "Parveen Travels", "Orange Tours", "YBM Travels", "IntrCity SmartBus",
];

export const TOURS: TourPackage[] = [
  {
    id: "t1", slug: "munnar-alleppey", themes: ["hills"], hotelStars: 3, meals: "Breakfast & dinner", cancellation: "Free cancellation up to 15 days before travel; 50% refund up to 7 days.",
    title: "Munnar & Alleppey Escape", location: "Kerala", days: 5, nights: 4, price: 18999, rating: 4.8, tag: "Bestseller", hue: 140,
    highlights: ["Tea estate walk", "Houseboat stay", "Eravikulam park"],
    includes: ["Hotels", "Breakfast", "Private cab", "Sightseeing"],
    itinerary: ["Arrive Kochi, drive to Munnar", "Munnar sightseeing & tea museum", "Drive to Thekkady, spice plantation", "Alleppey houseboat overnight", "Return to Kochi, departure"],
  },
  {
    id: "t2", slug: "goa-beach-holiday", themes: ["beach"], hotelStars: 4, meals: "Breakfast", cancellation: "Free cancellation up to 10 days before travel; 25% fee after that.",
    title: "Goa Beach Holiday", location: "Goa", days: 4, nights: 3, price: 14499, rating: 4.6, tag: "Trending", hue: 30,
    highlights: ["North & South Goa tour", "Sunset cruise", "Old Goa churches"],
    includes: ["Resort", "Breakfast", "Airport transfer", "Cruise"],
    itinerary: ["Arrive, check-in, beach evening", "North Goa: forts & beaches", "South Goa & Mandovi sunset cruise", "Departure"],
  },
  {
    id: "t3", slug: "ooty-kodaikanal", themes: ["hills"], hotelStars: 3, meals: "Breakfast & dinner", cancellation: "Free cancellation up to 7 days before travel.",
    title: "Ooty – Kodaikanal Hills", location: "Tamil Nadu", days: 4, nights: 3, price: 11999, rating: 4.7, hue: 100,
    highlights: ["Nilgiri toy train", "Botanical garden", "Kodai lake boating"],
    includes: ["Hotels", "Breakfast & dinner", "Cab from Chennai"],
    itinerary: ["Drive to Ooty, evening at lake", "Toy train & Doddabetta peak", "Drive to Kodaikanal", "Kodai sightseeing, return"],
  },
  {
    id: "t4", slug: "andaman-explorer", themes: ["beach"], hotelStars: 4, meals: "Breakfast", cancellation: "Flights non-refundable; land part refundable up to 21 days before travel.",
    title: "Andaman Island Explorer", location: "Port Blair · Havelock", days: 6, nights: 5, price: 32999, rating: 4.9, tag: "Premium", hue: 190,
    highlights: ["Radhanagar beach", "Scuba at Havelock", "Cellular jail light show"],
    includes: ["Flights from Chennai", "Hotels", "Ferry tickets", "Breakfast"],
    itinerary: ["Fly to Port Blair, Cellular Jail", "Ferry to Havelock", "Radhanagar beach & scuba", "Neil island day trip", "Back to Port Blair, shopping", "Departure"],
  },
  {
    id: "t5", slug: "dubai-city-lights", themes: ["international"], hotelStars: 4, meals: "Breakfast", cancellation: "Visa fee non-refundable; 75% refund up to 21 days before travel.",
    title: "Dubai City Lights", location: "UAE", days: 5, nights: 4, price: 54999, rating: 4.7, tag: "International", hue: 45,
    highlights: ["Burj Khalifa 124th floor", "Desert safari", "Dhow cruise dinner"],
    includes: ["Return flights", "Visa", "4★ hotel", "Transfers"],
    itinerary: ["Arrive Dubai, dhow cruise", "City tour & Burj Khalifa", "Desert safari with BBQ", "Abu Dhabi day trip", "Departure"],
  },
  {
    id: "t6", slug: "pondicherry-weekend", themes: ["weekend","heritage"], hotelStars: 3, meals: "Breakfast", cancellation: "Free cancellation up to 3 days before travel.",
    title: "Pondicherry Weekend", location: "Puducherry", days: 2, nights: 1, price: 4999, rating: 4.5, hue: 210,
    highlights: ["French quarter walk", "Auroville", "Paradise beach"],
    includes: ["Boutique stay", "Breakfast", "AC cab from Chennai"],
    itinerary: ["ECR drive, French quarter & promenade", "Auroville, Paradise beach, return"],
  },
  {
    id: "t7", slug: "mysore-coorg", themes: ["hills", "heritage"], hotelStars: 4, meals: "Breakfast", cancellation: "Free cancellation up to 7 days before travel.",
    title: "Mysore & Coorg Retreat", location: "Karnataka", days: 4, nights: 3, price: 13999, rating: 4.6, hue: 120,
    highlights: ["Mysore Palace", "Coffee estate stay", "Abbey Falls"],
    includes: ["Hotels", "Breakfast", "Private cab", "Sightseeing"],
    itinerary: ["Drive to Mysore, palace light show", "Chamundi hills, drive to Coorg", "Abbey Falls, Raja's Seat, coffee walk", "Dubare elephant camp, return"],
  },
  {
    id: "t8", slug: "bali-island-bliss", themes: ["international", "beach"], hotelStars: 4, meals: "Breakfast", cancellation: "Flights non-refundable; 50% refund up to 30 days before travel.",
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
  { id: "tv1", name: "Innova Crysta", seats: 7, perKm: 19, minKmPerDay: 250, driverBataPerDay: 400, localPackage: 2800, features: ["AC", "Push-back seats", "Carrier"] },
  { id: "tv2", name: "Tempo Traveller 12-seater", seats: 12, perKm: 24, minKmPerDay: 250, driverBataPerDay: 500, localPackage: 3800, features: ["AC", "Pushback", "Music system"] },
  { id: "tv3", name: "Force Urbania 17-seater", seats: 17, perKm: 32, minKmPerDay: 300, driverBataPerDay: 600, localPackage: 5500, features: ["AC", "Recliners", "USB charging", "LED TV"] },
  { id: "tv4", name: "Mini Bus 26-seater", seats: 26, perKm: 42, minKmPerDay: 300, driverBataPerDay: 700, localPackage: 7500, features: ["AC", "Mic & speakers", "Luggage boot"] },
  { id: "tv5", name: "Luxury Coach 45-seater", seats: 45, perKm: 65, minKmPerDay: 300, driverBataPerDay: 900, localPackage: 12000, features: ["AC", "Recliners", "Washroom", "LED TV"] },
];
