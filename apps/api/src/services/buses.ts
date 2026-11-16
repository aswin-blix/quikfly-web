import { BUS } from "../config";
import { BUS_OPERATORS } from "@quikfly/shared";
import { seeded } from "../lib/random";
import type { Bus, Seat } from "@quikfly/shared";

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/** Generated timetable: the same route and date always return the same buses. */
export function searchBuses(from: string, to: string, date: string): Bus[] {
  const rnd = seeded(`${from}-${to}-${date}`);
  const hours = 5 + Math.floor(rnd() * 5);
  const list = Array.from({ length: BUS.resultsPerSearch }, (_, i): Bus => {
    const t = BUS.types[Math.floor(rnd() * BUS.types.length)];
    const dh = BUS.firstDepartureHour + i + Math.floor(rnd() * 2);
    const dm = [0, 15, 30, 45][Math.floor(rnd() * 4)];
    const dur = hours + Math.floor(rnd() * 3);
    const base = (t.ac ? BUS.baseFare.ac : BUS.baseFare.nonAc) + (t.sleeper ? BUS.baseFare.sleeperExtra : 0)
      + Math.floor(rnd() * BUS.baseFare.randomExtra);
    return {
      id: `bus${i}-${from}-${to}`.replace(/\s/g, ""),
      operator: i === 0 ? BUS_OPERATORS[0] : BUS_OPERATORS[1 + Math.floor(rnd() * (BUS_OPERATORS.length - 1))],
      ...t,
      depart: hhmm(dh, dm),
      arrive: hhmm((dh + dur) % 24, (dm + 30) % 60),
      duration: `${dur}h 30m`,
      fare: Math.round(base / 10) * 10,
      seatsLeft: 4 + Math.floor(rnd() * 28),
      rating: Math.round((3.8 + rnd() * 1.1) * 10) / 10,
      amenities: BUS.amenities.filter(() => rnd() > 0.35),
      boardingPoints: [`${from} – Main Bus Stand`, `${from} – Bypass`, `${from} – City Center`],
    };
  });
  return list.sort((a, b) => a.depart.localeCompare(b.depart));
}

/** 2+1 sleeper layout on two decks: columns 0 and 1 are the double side, column 2 the single. */
export function busSeats(busId: string, date: string): Seat[] {
  const rnd = seeded(busId + date);
  const seats: Seat[] = [];
  for (const deck of ["lower", "upper"] as const) {
    const prefix = deck === "lower" ? "L" : "U";
    for (let row = 0; row < BUS.seatRowsPerDeck; row++) {
      for (let col = 0; col < BUS.seatColsPerRow; col++) {
        seats.push({
          id: `${prefix}${seats.length + 1}`,
          label: `${prefix}${row * BUS.seatColsPerRow + col + 1}`,
          deck, row, col, sleeper: true,
          booked: rnd() < BUS.bookedChance,
          ladies: rnd() < BUS.ladiesChance,
          price: 0,
        });
      }
    }
  }
  return seats;
}
