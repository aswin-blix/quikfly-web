// The six QuikFly services: names, icons, images and where each one opens.
// Mirrors apps/web/src/lib/services.ts.
import 'package:flutter/material.dart';
import '../api/models.dart';

class ServiceMeta {
  const ServiceMeta({
    required this.key,
    required this.title,
    required this.action,
    required this.route,
    required this.tagline,
    required this.blurb,
    required this.image,
    required this.icon,
  });
  final ServiceKey key;
  final String title, action, route, tagline, blurb, image;
  final IconData icon;
}

/// Service photos (1200 px WebP in assets/images/services/). Other screens reuse them via serviceOf(...).image.
const services = <ServiceMeta>[
  ServiceMeta(key: ServiceKey.bike, title: 'Bike', action: 'Bike Taxi', route: '/ride/bike', tagline: 'Beat the traffic',
      blurb: 'Bikes, e-bikes and autos at your doorstep in under 5 minutes.', image: 'assets/images/services/bike-taxi.webp', icon: Icons.two_wheeler),
  ServiceMeta(key: ServiceKey.car, title: 'Car', action: 'Car Ride', route: '/ride/car', tagline: 'Ride in comfort',
      blurb: 'Mini, Sedan, SUV or Prime with upfront fares and verified drivers.', image: 'assets/images/services/car-ride.webp', icon: Icons.local_taxi),
  ServiceMeta(key: ServiceKey.bus, title: 'Travels', action: 'Bus Booking', route: '/bus', tagline: 'Pick your seat',
      blurb: 'Intercity sleeper and seater buses with live seat maps.', image: 'assets/images/services/bus-booking.webp', icon: Icons.directions_bus),
  ServiceMeta(key: ServiceKey.tours, title: 'Holiday Trip', action: 'Tour Packages', route: '/holidays', tagline: 'Curated getaways',
      blurb: 'Handpicked holidays across India and abroad, all-inclusive.', image: 'assets/images/services/tour-packages.webp', icon: Icons.beach_access),
  ServiceMeta(key: ServiceKey.rent, title: 'Rental Car', action: 'Rent a Car', route: '/rent', tagline: 'Drive yourself',
      blurb: 'Self-drive or chauffeur cars by the hour, day or week.', image: 'assets/images/services/rent-a-car.webp', icon: Icons.key),
  ServiceMeta(key: ServiceKey.rentals, title: 'Rental Trip', action: 'Travel Rentals', route: '/group', tagline: 'Travel together',
      blurb: 'Tempo travellers, Urbanias and coaches for family and group trips.', image: 'assets/images/services/travel-rentals.webp', icon: Icons.airport_shuttle),
];

ServiceMeta serviceOf(ServiceKey k) => services.firstWhere((s) => s.key == k);
