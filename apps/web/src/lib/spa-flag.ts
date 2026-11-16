// Build-time flag (plain module so server components read the real value).
export const SPA = process.env.NEXT_PUBLIC_SPA === "1";
