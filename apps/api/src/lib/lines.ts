// Booking lines ([label, value] pairs).

/** Replaces (or adds) one line, keeping the others in place. */
export function setLine(lines: [string, string][], key: string, value: string): [string, string][] {
  return lines.some(([k]) => k === key) ? lines.map(([k, v]) => (k === key ? [k, value] : [k, v])) : [...lines, [key, value]];
}
