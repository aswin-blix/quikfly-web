"use client";
import { motion } from "framer-motion";
import { BadgeCheck, Clock, HardHat, IndianRupee, KeyRound, MapPin, Share2, ShieldCheck, Users } from "lucide-react";
import { RidePanel } from "@/components/RidePanel";
import { fadeUp, Reveal, StaggerGroup } from "@/components/motion";
import { Accordion, PageHeader, SectionTitle } from "@/components/ui";
import { RIDE_OPTIONS } from "@quikfly/shared";
import { FAQS } from "@/lib/api/data";
import { inr } from "@/lib/format";
import { Link, useQuery } from "@/lib/nav";
import { serviceByKey, SERVICES } from "@/lib/services";

export function RideScreen({ service }: { service: "bike" | "car" }) {
  const q = useQuery();
  const s = serviceByKey(service);
  const options = RIDE_OPTIONS.filter((o) => o.service === service);
  const other = SERVICES.find((x) => x.key === (service === "bike" ? "car" : "bike"))!;

  return (
    <>
      <PageHeader crumbs={[["Home", "/"], [s.action]]} title={service === "bike" ? "Bike taxi & autos" : "Book a cab"}
        sub={service === "bike" ? "Zip through city traffic at half the price of a cab. Captains reach you in under 5 minutes." : "Upfront fares, verified drivers and live tracking — from quick Minis to Prime sedans."}
        icon={<s.icon className="text-gold" size={36} />}>
        <div className="flex flex-wrap gap-2 mt-5 text-xs">
          {["Upfront fares", "Ride OTP", "Live trip sharing", "24×7 support"].map((t) => <span key={t} className="chip flex items-center gap-1"><BadgeCheck size={12} className="text-gold" />{t}</span>)}
          <Link href={other.href} className="chip !border-gold/40 !text-gold">Need a {service === "bike" ? "cab" : "bike"} instead? →</Link>
        </div>
      </PageHeader>

      <section className="max-w-7xl mx-auto px-4">
        <RidePanel service={service} initialFrom={q.get("from")} initialTo={q.get("to")} />
      </section>

      <section className="max-w-7xl mx-auto px-4 pt-20">
        <SectionTitle eyebrow="Ride options" title={service === "bike" ? "Pick how you want to zip" : "A ride for every occasion"} />
        <StaggerGroup className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {options.map((o) => (
            <motion.div key={o.id} variants={fadeUp} whileHover={{ y: -6 }} className="panel p-5">
              <img src={service === "bike" ? "/assets/s0.jpg" : o.id === "prime" || o.id === "suv" ? "/assets/s4.jpg" : "/assets/s1.jpg"} alt="" className="w-full h-28 object-cover rounded-xl" />
              <p className="font-semibold text-lg mt-4 flex items-center justify-between">{o.name}<span className="text-xs text-muted flex items-center gap-1"><Users size={12} />{o.seats}</span></p>
              <p className="text-sm text-muted mt-1">{o.description}</p>
              <p className="text-xs text-subtle mt-3 border-t border-line pt-3">Base {inr(o.baseFare)} · {inr(o.perKm)}/km · {inr(o.perMin)}/min</p>
            </motion.div>
          ))}
        </StaggerGroup>
      </section>

      <section className="max-w-7xl mx-auto px-4 pt-20 grid lg:grid-cols-2 gap-10">
        <div>
          <SectionTitle eyebrow="How it works" title="Booked in 3 taps" />
          <ol className="space-y-5">
            {[[MapPin, "Set pickup & drop", "Choose from saved places or search any landmark."], [IndianRupee, "Compare upfront fares", "See every option with ETA and exact price before booking."], [KeyRound, "Share OTP & ride", "Your driver starts the trip only after you share the OTP."]].map(([I, t, d], i) => {
              const Icon = I as typeof MapPin;
              return (
                <Reveal key={t as string} delay={i * 0.1}>
                  <li className="flex gap-4">
                    <span className="w-11 h-11 shrink-0 rounded-xl bg-gold/10 text-gold grid place-items-center"><Icon size={20} /></span>
                    <div><p className="font-semibold">{i + 1}. {t as string}</p><p className="text-sm text-muted">{d as string}</p></div>
                  </li>
                </Reveal>
              );
            })}
          </ol>
        </div>
        <div>
          <SectionTitle eyebrow="Safety" title="Safe from pickup to drop" />
          <div className="grid sm:grid-cols-2 gap-3">
            {[[ShieldCheck, "Verified captains"], [Share2, "Share live location"], [service === "bike" ? HardHat : Clock, service === "bike" ? "Pillion helmet provided" : "Punctual pickups"], [BadgeCheck, "Insured every trip"]].map(([I, t]) => {
              const Icon = I as typeof ShieldCheck;
              return <Reveal key={t as string}><div className="panel p-4 flex items-center gap-3"><Icon className="text-success" size={20} /><span className="text-sm">{t as string}</span></div></Reveal>;
            })}
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 pt-20">
        <SectionTitle center eyebrow="FAQ" title="Ride questions, answered" />
        <Accordion items={FAQS.filter((f) => f.category === "Rides" || f.category === "Payments").map((f) => ({ q: f.q, a: f.a }))} />
      </section>
    </>
  );
}
