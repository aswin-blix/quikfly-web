"use client";
// Re-mounts on every route change in the App Router → page enter animation.
import { PageTransition } from "@/components/shell";
import { SPA } from "@/lib/spa-flag";

export default function Template({ children }: { children: React.ReactNode }) {
  if (SPA) return <>{children}</>;
  return <PageTransition>{children}</PageTransition>;
}
