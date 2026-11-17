"use client";
// Catalog lists too big for GET /config (holidays, rental cars, group vehicles). Fetched once
// per page load and shared between components; null while loading.
import { useEffect, useState } from "react";
import type { RentalCar, TourPackage, TravelVehicle } from "@quikfly/shared";
import { api } from "@/lib/api";

function shared<T>(load: () => Promise<T>) {
  let promise: Promise<T> | null = null;
  let value: T | null = null;
  return function useShared(): T | null {
    const [v, setV] = useState<T | null>(value);
    useEffect(() => {
      if (value) return;
      promise ??= load().then((x) => (value = x)).catch((e) => { promise = null; throw e; });
      let alive = true;
      promise.then((x) => alive && setV(x)).catch(() => { /* screens show their empty state */ });
      return () => { alive = false; };
    }, []);
    return v;
  };
}

export const useTours = shared<TourPackage[]>(() => api.tours.list());
export const useRentalCars = shared<RentalCar[]>(() => api.rentals.cars(""));
export const useTravelVehicles = shared<TravelVehicle[]>(() => api.rentals.travelVehicles());
