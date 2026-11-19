import type { Metadata } from "next";
import { Suspense } from "react";
import { TicketScreen } from "@/screens/TicketScreen";

// m-Tickets are private to whoever has the link: keep them out of search results.
export const metadata: Metadata = { title: "m-Ticket | QuikFly", description: "A QuikFly bus m-ticket.", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense><TicketScreen /></Suspense>;
}
