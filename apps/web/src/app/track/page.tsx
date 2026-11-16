import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackScreen } from "@/screens/TrackScreen";

// Shared trip links are private to whoever has them: keep them out of search results.
export const metadata: Metadata = { title: "Shared trip | QuikFly", description: "Follow a QuikFly ride live.", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense><TrackScreen /></Suspense>;
}
