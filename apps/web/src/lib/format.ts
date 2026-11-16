export const inr = (n: number) =>
  "₹" + Math.round(n).toLocaleString("en-IN");

export const todayISO = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};

export const nowLocal = (offsetHours = 0) => {
  const d = new Date(Date.now() + offsetHours * 3600000);
  d.setMinutes(0, 0, 0);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
};

export const prettyDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export const prettyDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
