import type { Metadata } from "next";
import { TOURS } from "@/lib/api/data";
import { HolidayDetailScreen } from "@/screens/HolidayScreens";

export const dynamicParams = false;
export function generateStaticParams() {
  return TOURS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = TOURS.find((x) => x.slug === slug);
  return { title: `${t?.title ?? "Holiday"} | QuikFly Holidays`, description: t ? `${t.days}D/${t.nights}N in ${t.location} from ₹${t.price}` : undefined };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <HolidayDetailScreen slug={(await params).slug} />;
}
