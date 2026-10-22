// Homepage sections about what Almost offers: the rack funnel, use cases, categories,
// measured speed, why Almost, the roadmap and common questions.
// Every feature is marked "Now" (works in the MVP) or "Roadmap" (planned), so nothing is overclaimed.

import Reveal from "./Reveal";
import { Badge, Section } from "./Section";

const FUNNEL = [
  { n: "01", title: "Walked past", value: "—", sub: "shoppers who pass without stopping", text: "The racks people ignore completely.", status: "roadmap" as const },
  { n: "02", title: "Stopped", value: "400", sub: "stops across 5 racks", text: "A shopper in a rack's zone for 3 seconds or more.", status: "now" as const },
  { n: "03", title: "Peak", value: "12:00", sub: "busiest hour per rack", text: "When each rack draws the most attention.", status: "now" as const },
  { n: "04", title: "Bought", value: "81", sub: "units, from your POS", text: "Till sales matched to racks through the rack map.", status: "now" as const },
  { n: "05", title: "Converted", value: "4 vs 38", sub: "sales per 100 stops, R4 vs R1", text: "The same attention turns into very different sales.", status: "now" as const },
];

const CHECKS = [
  { text: "Check the price", status: "now" as const },
  { text: "Check size availability", status: "now" as const },
  { text: "Check for a missing promo", status: "now" as const },
  { text: "Rethink the display or placement", status: "now" as const },
  { text: "Compare the rack across stores", status: "roadmap" as const },
  { text: "Measure the fix, before and after", status: "roadmap" as const },
];

const USE_CASES = [
  { title: "Rack performance review", text: "Rank every rack by attention against sales, and see which ones to fix first.", status: "now" as const },
  { title: "Window and display check", text: "Find out whether the display that draws the crowd actually sells.", status: "now" as const },
  { title: "Visit planning", text: "Visit only the flagged stores, with the brief as the agenda.", status: "now" as const },
  { title: "Layout change, before and after", text: "Move a rack, then compare stops and sales with the weeks before.", status: "roadmap" as const },
  { title: "Store benchmarking", text: "The same report across every store, so the weakest racks stand out.", status: "roadmap" as const },
  { title: "Store-manager tasks", text: "Approved fixes go to the store manager on WhatsApp; a photo confirms it's done.", status: "roadmap" as const },
];

const CATEGORIES = [
  { name: "Apparel", q: "Which racks draw a crowd but don't sell?", status: "now" as const },
  { name: "Ethnic wear", q: "Which kurta and saree displays stop shoppers?", status: "now" as const },
  { name: "Denim walls", q: "Which part of the wall do shoppers stop at?", status: "now" as const },
  { name: "Accessories", q: "Do impulse stands near the till earn their space?", status: "now" as const },
  { name: "Footwear", q: "Which shelves are browsed most, and which convert?", status: "now" as const },
  { name: "Trial rooms", q: "What gets tried on, and what goes back?", status: "roadmap" as const },
];

const MEASURED = [
  { value: "0.7 s", label: "From upload to the ranked rack table", note: "Live site, sample files: 5 racks, 400 stops" },
  { value: "12–27 s", label: "For the AI brief, with snapshot frames", note: "Across 4 runs, local and live" },
  { value: "0 of 13", label: "Bad uploads that reached the AI", note: "Every bad file was stopped with a clear message" },
];

const WHY = [
  { title: "The CCTV you already have", text: "A recorded clip from one existing camera. No new cameras, tags or shelf sensors." },
  { title: "Your POS export, as is", text: "A CSV with SKU and quantity. No integration project to get started." },
  { title: "One rack map to set up", text: "List which SKUs sit on which rack once. Update it when the layout changes." },
  { title: "A rule you can read", text: "A rack is flagged at 10% or more of stops with less than half that share of sales." },
  { title: "Advice with its numbers", text: "Every brief quotes the figures behind it and lists stock, price and promo to rule out first." },
  { title: "Built for Indian fashion retail", text: "Designed for heads of retail at digital-first brands running 5 to 50 mall stores." },
];

const ROADMAP = [
  "Nightly automatic runs for every camera",
  "Walked-past counts for every rack",
  "Multi-store comparison and benchmarking",
  "Store-manager tasks over WhatsApp, with photo checks",
  "Before/after measurement of every fix",
  "Stock levels in the join, to rule out stock-outs",
  "Staff excluded from counts",
  "Remote updates and health alerts for every store device",
];

const FAQ = [
  {
    q: "What is Almost?",
    a: "Software that turns a day of CCTV footage and the same day's POS sales into a ranked list of racks that shoppers stop at but don't buy from, with an AI brief on what to fix.",
  },
  {
    q: "How is it different from a people counter or a heatmap?",
    a: "A counter tells you how many came in, and a heatmap shows where people walked. Almost joins attention at each rack with that rack's sales, so you see where interest isn't turning into purchases.",
  },
  {
    q: "Does Almost use face recognition?",
    a: "No. Shoppers are tracked as anonymous boxes within one clip, with short-lived numbers. No faces are stored or matched, and no one is recognised from one visit to the next.",
  },
  {
    q: "Do I need new cameras?",
    a: "Not for rack stops: they work with a recorded clip from a camera you already have, as long as it can see the racks. Product pickups need a webcam or IP camera close to the rack, because a ceiling camera is too far away to see what's in a shopper's hand.",
  },
  {
    q: "Do I need screens?",
    a: "No. Pickups are counted with a camera alone. A screen beside the rack is optional: it shows the product a shopper is holding, and any display with a web browser will do.",
  },
  {
    q: "What data do I need?",
    a: "One recorded clip, the same day's POS export (SKU and quantity), and a rack map listing which SKUs sit on which rack.",
  },
  {
    q: "Is the AI always right?",
    a: "No, which is why every brief shows its numbers and lists stock, price and promo as causes to rule out first. The head of retail approves every fix; nothing changes in a store automatically.",
  },
  {
    q: "What leaves the store?",
    a: "The stop counter runs on your own computer. Only the stop counts, and any snapshot frames you choose to upload, leave it. The frames are sent to the AI to help write the brief.",
  },
];

export function RackFunnel() {
  return (
    <Section
      id="funnel"
      eyebrow="The rack funnel"
      title={<>From first glance<br /><span className="text-amber">to the till.</span></>}
      intro="Online stores have measured every step before a purchase for years. Almost brings the same view to the racks in a physical store."
    >
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {FUNNEL.map((f, i) => (
          <Reveal key={f.n} className={`card flex flex-col p-6 ${f.status === "roadmap" ? "border-dashed" : ""}`} delay={i * 70}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-amber">{f.n}</span>
              <Badge status={f.status} />
            </div>
            <p className="display mt-4 text-xl">{f.title}</p>
            <p className={`display mt-5 text-4xl ${f.status === "roadmap" ? "text-muted" : ""}`}>{f.value}</p>
            <p className="text-sm text-muted">{f.sub}</p>
            <p className="mt-4 text-sm leading-relaxed text-muted">{f.text}</p>
          </Reveal>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted">○ Example data, from the sample files in the demo below.</p>
    </Section>
  );
}

export function WhatToCheck() {
  return (
    <Reveal className="card mt-4 p-6 sm:p-8">
      <p className="text-xs font-bold tracking-[0.2em] text-muted uppercase">What to check next, for a flagged rack</p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CHECKS.map((c) => (
          <li key={c.text} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <span>{c.text}</span>
            <Badge status={c.status} />
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

export function UseCases() {
  return (
    <Section id="use-cases" eyebrow="Use cases" title={<>One camera.<br /><span className="text-muted">Many decisions.</span></>}>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {USE_CASES.map((u, i) => (
          <Reveal key={u.title} className={`card p-7 ${u.status === "roadmap" ? "border-dashed" : ""}`} delay={(i % 3) * 80}>
            <Badge status={u.status} />
            <p className="display mt-4 text-xl">{u.title}</p>
            <p className="mt-3 text-muted">{u.text}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

export function Categories() {
  return (
    <Section
      id="categories"
      eyebrow="Built for fashion"
      title={<>Every rack<br /><span className="text-amber">asks a question.</span></>}
      intro="Almost works at rack level, so any category displayed on racks, tables or walls can be measured today."
    >
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c, i) => (
          <Reveal key={c.name} className={`card p-7 ${c.status === "roadmap" ? "border-dashed" : ""}`} delay={(i % 3) * 80}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold tracking-[0.2em] text-amber uppercase">{c.name}</p>
              <Badge status={c.status} />
            </div>
            <p className="display mt-4 text-xl leading-snug">{c.q}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

export function Measured() {
  return (
    <Section id="measured" eyebrow="Measured, not promised" title={<>Fast enough<br /><span className="text-muted">for a store review.</span></>}>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {MEASURED.map((m, i) => (
          <Reveal key={m.label} className="card p-7" delay={i * 80}>
            <p className="display text-5xl text-amber">{m.value}</p>
            <p className="mt-3 font-semibold">{m.label}</p>
            <p className="mt-2 text-sm text-muted">{m.note}</p>
          </Reveal>
        ))}
      </div>
      <p className="mt-4 max-w-3xl text-sm text-muted">
        Measured on 22 October 2026 with the demo&apos;s sample files. Counting stops in the footage runs separately on a
        laptop and isn&apos;t included; we&apos;ll publish that once it&apos;s measured on real footage.
      </p>
    </Section>
  );
}

export function WhyAlmost() {
  return (
    <Section id="why" eyebrow="Why Almost" title={<>Starts with what you have.<br /><span className="text-muted">No new hardware.</span></>}>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WHY.map((w, i) => (
          <Reveal key={w.title} className="card p-7" delay={(i % 3) * 80}>
            <p className="display text-xl">{w.title}</p>
            <p className="mt-3 text-muted">{w.text}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

export function Roadmap() {
  return (
    <Section
      id="roadmap"
      eyebrow="What's next"
      title={<>Today, one camera.<br /><span className="text-amber">Next, every store.</span></>}
      intro="The MVP analyses a recorded day from one camera. This is what comes after."
    >
      <div className="mt-12 grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <Reveal className="card border-mint/30 p-7">
          <Badge status="now" />
          <p className="display mt-4 text-2xl">In the MVP today</p>
          <ul className="mt-5 space-y-3 text-fg/90">
            {["Stop counting from recorded footage", "Stops joined with POS sales", "Ranked racks, flags and sales per 100 stops", "AI brief with reasons, checks and a fix"].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-mint" /> {t}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal className="card border-dashed p-7" delay={100}>
          <Badge status="roadmap" />
          <p className="display mt-4 text-2xl">On the roadmap</p>
          <ul className="mt-5 grid gap-3 text-muted sm:grid-cols-2">
            {ROADMAP.map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted" /> {t}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}

export function Faq() {
  return (
    <Section id="faq" eyebrow="Common questions" title={<>Good questions.<br /><span className="text-muted">Straight answers.</span></>}>
      <div className="mt-12 divide-y divide-line border-y border-line">
        {FAQ.map((f) => (
          <details key={f.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-semibold">
              {f.q}
              <span className="display text-2xl text-amber transition group-open:rotate-45" aria-hidden>+</span>
            </summary>
            <p className="mt-3 max-w-3xl text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
