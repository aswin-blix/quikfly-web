"use client";
// Reusable animation building blocks.
// Framer Motion → component-level state animations (enter/exit, hover, layout, drag).
// GSAP → timeline & scroll-driven effects (split text, counters, marquee, parallax).
import { motion, useMotionValue, useSpring, useTransform, type Variants } from "framer-motion";
import { useRef } from "react";
import { gsap, prefersReducedMotion, ScrollTrigger, SplitText, useGSAP } from "@/lib/gsap";
import { cx } from "@/lib/format";

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};
export const stagger = (s = 0.08): Variants => ({ hidden: {}, show: { transition: { staggerChildren: s } } });

/** Fade-up when scrolled into view (Framer Motion). */
export function Reveal({ children, delay = 0, className, y = 24 }: { children: React.ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

/** Staggered grid/list: children should be <motion.div variants={fadeUp}>. */
export function StaggerGroup({ children, className, gap = 0.08 }: { children: React.ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div className={className} variants={stagger(gap)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }}>
      {children}
    </motion.div>
  );
}

/** Mouse-follow 3D tilt (Framer Motion springs). */
export function Tilt({ children, className, max = 8 }: { children: React.ReactNode; className?: string; max?: number }) {
  const x = useMotionValue(0.5), y = useMotionValue(0.5);
  const rx = useSpring(useTransform(y, [0, 1], [max, -max]), { stiffness: 200, damping: 18 });
  const ry = useSpring(useTransform(x, [0, 1], [-max, max]), { stiffness: 200, damping: 18 });
  return (
    <motion.div className={className} style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width); y.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => { x.set(0.5); y.set(0.5); }}>
      {children}
    </motion.div>
  );
}

/** Magnetic hover for CTAs (Framer Motion). */
export function Magnetic({ children, className, strength = 0.25 }: { children: React.ReactNode; className?: string; strength?: number }) {
  const x = useSpring(0, { stiffness: 250, damping: 15 }), y = useSpring(0, { stiffness: 250, damping: 15 });
  return (
    <motion.div className={cx("inline-block", className)} style={{ x, y }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * strength); y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      {children}
    </motion.div>
  );
}

/** Word-by-word headline reveal (GSAP SplitText). */
export function SplitHeadline({ children, className, as: Tag = "h1", delay = 0.1 }: { children: React.ReactNode; className?: string; as?: "h1" | "h2"; delay?: number }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(() => {
    if (!ref.current || prefersReducedMotion()) return;
    const split = SplitText.create(ref.current, { type: "words,lines", mask: "lines" });
    // background-clip:text doesn't reach transformed children, so give gold words their own gradient.
    (split.words as HTMLElement[]).forEach((w) => w.parentElement?.closest(".gold-text") && w.classList.add("gold-text"));
    gsap.from(split.words, { yPercent: 110, opacity: 0, duration: 0.9, ease: "power4.out", stagger: 0.06, delay });
    return () => split.revert();
  }, { scope: ref });
  return <Tag ref={ref} className={className}>{children}</Tag>;
}

/** Animated number that counts up when visible (GSAP + ScrollTrigger). */
export function CountUp({ to, decimals = 0, prefix = "", suffix = "", className }: { to: number; decimals?: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = (n: number) => prefix + n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  useGSAP(() => {
    if (!ref.current) return;
    const o = { v: 0 };
    gsap.to(o, {
      v: to, duration: prefersReducedMotion() ? 0 : 1.8, ease: "power2.out",
      scrollTrigger: { trigger: ref.current, start: "top 90%", once: true },
      onUpdate: () => { if (ref.current) ref.current.textContent = fmt(o.v); },
    });
  }, { dependencies: [to] });
  return <span ref={ref} className={className}>{fmt(0)}</span>;
}

/** Tweens a number whenever `value` changes (GSAP). Good for live prices. */
export function TweenNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(value);
  useGSAP(() => {
    const o = { v: last.current };
    gsap.to(o, {
      v: value, duration: 0.6, ease: "power2.out",
      onUpdate: () => { if (ref.current) ref.current.textContent = format(o.v); },
      onComplete: () => { last.current = value; },
    });
  }, { dependencies: [value] });
  return <span ref={ref} className={className}>{format(value)}</span>;
}

/** Infinite horizontal marquee (GSAP). */
export function Marquee({ children, speed = 40, className }: { children: React.ReactNode; speed?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const track = ref.current?.firstElementChild as HTMLElement | null;
    if (!track || prefersReducedMotion()) return;
    const w = track.scrollWidth / 2;
    const tw = gsap.to(track, { x: -w, duration: w / speed, ease: "none", repeat: -1 });
    const el = ref.current!;
    const slow = () => gsap.to(tw, { timeScale: 0.2, duration: 0.4 });
    const fast = () => gsap.to(tw, { timeScale: 1, duration: 0.4 });
    el.addEventListener("pointerenter", slow); el.addEventListener("pointerleave", fast);
    return () => { el.removeEventListener("pointerenter", slow); el.removeEventListener("pointerleave", fast); };
  }, { scope: ref });
  return (
    <div ref={ref} className={cx("overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]", className)}>
      <div className="flex w-max">
        <div className="flex gap-4 pr-4">{children}</div>
        <div className="flex gap-4 pr-4" aria-hidden>{children}</div>
      </div>
    </div>
  );
}

/** Scroll-linked parallax for images/blocks (GSAP ScrollTrigger scrub). */
export function Parallax({ children, amount = 60, className }: { children: React.ReactNode; amount?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!ref.current || prefersReducedMotion()) return;
    gsap.fromTo(ref.current, { y: -amount / 2 }, {
      y: amount / 2, ease: "none",
      scrollTrigger: { trigger: ref.current, start: "top bottom", end: "bottom top", scrub: true },
    });
  }, { scope: ref });
  return <div ref={ref} className={className}>{children}</div>;
}

export { ScrollTrigger };
