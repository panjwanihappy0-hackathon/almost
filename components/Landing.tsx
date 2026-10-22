// The homepage: what Almost does, before the live demo below it.
// Plain content only: no data, no AI. Numbers marked "example" are illustrations.

import CameraView from "./CameraView";
import { Categories, Faq, Measured, RackFunnel, Roadmap, UseCases, WhatToCheck, WhyAlmost } from "./Offering";
import Reveal from "./Reveal";
import { Section } from "./Section";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#insight", label: "Insight" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#privacy", label: "Privacy" },
  { href: "#faq", label: "FAQ" },
];

const PILLARS = [
  { label: "Watch", text: "Rack stops" },
  { label: "Compare", text: "Stops vs sales" },
  { label: "Act", text: "Fix this week" },
];

const STATS = [
  { value: "400", label: "Stops counted", bars: [3, 5, 8, 9, 7, 6, 8, 5] },
  { value: "38%", label: "At rack R4", bars: [2, 3, 5, 8, 9, 9, 7, 8] },
  { value: "7%", label: "R4 share of sales", bars: [3, 2, 2, 1, 2, 1, 2, 1] },
  { value: "2", label: "Racks flagged", bars: [1, 1, 2, 2, 2, 2, 2, 2] },
];

const STEPS = [
  { n: "01", title: "Watch", metric: "1 camera", sub: "recorded footage", text: "The CCTV you already have records the floor as usual. No new hardware, no tags on products." },
  { n: "02", title: "Understand", metric: "3 s", sub: "in a rack zone = a stop", text: "AI follows each shopper anonymously and notes which rack they stop at and when." },
  { n: "03", title: "Compare", metric: "5 racks", sub: "matched to the POS", text: "Each rack's share of stops is set against its share of till sales, through a simple rack-to-product map." },
  { n: "04", title: "Act", metric: "1 fix", sub: "per flagged rack", text: "An AI brief explains likely reasons and suggests a fix, such as moving a rack, changing a display or restocking a size." },
];

const POS_SEES = ["Bill number and time", "SKU and quantity", "Revenue per store"];
const ALMOST_ADDS = ["Stops at every rack", "The busiest hour per rack", "Sales per 100 stops, rack by rack", "A frame of the moment, as evidence"];

const BENEFITS = [
  { title: "Fewer store visits", text: "Go only where the data points, with an agenda, instead of walking every store every week." },
  { title: "Layouts backed by behaviour", text: "Shelf and display changes rest on what shoppers actually did, not a visit-day impression." },
  { title: "Every fix checked", text: "Each suggestion comes with the numbers behind it and the other causes to rule out first." },
];

const PRIVACY = [
  { title: "No face recognition", text: "Shoppers are tracked as anonymous boxes within one camera. No faces are stored or matched." },
  { title: "No shopper profiles", text: "Nobody is identified, and no one is recognised from one visit to the next." },
  { title: "Footage stays on your computer", text: "Stops are counted on your own laptop. Only the counts, and any snapshot frames you choose to upload for the AI brief, leave it." },
];

export default function Landing() {
  return (
    <>
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div>
            <p className="eyebrow">Shelf intelligence for fashion retail</p>
            <h1 className="display mt-5 text-[3.2rem] sm:text-7xl">
              Shoppers stopped.
              <br />
              <span className="text-amber">Almost bought.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              Almost turns the CCTV you already have into a ranked list of racks that win attention but lose the sale,
              with an AI brief on what to fix. <span className="font-semibold text-fg">Sales data shows what sold. Almost shows what nearly did.</span>
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#try" className="btn-primary">
                Try it on a day of footage <span aria-hidden>→</span>
              </a>
              <a href="#how" className="btn-ghost">
                See how it works
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-4">
              {PILLARS.map((p) => (
                <div key={p.label}>
                  <p className="text-xs font-bold tracking-[0.2em] text-amber uppercase">{p.label}</p>
                  <p className="mt-1 text-sm text-muted">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
          <CameraView />
        </div>

        {/* Example stats strip */}
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="card px-5 py-5 sm:px-7">
            <div className="flex items-center justify-between text-xs font-bold tracking-[0.18em] uppercase">
              <span className="text-muted">Today · one store</span>
              <span className="text-muted/70">○ Example data</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label}>
                  <p className="display text-3xl sm:text-4xl">{s.value}</p>
                  <p className="mt-1 text-sm text-muted">{s.label}</p>
                  <div className="mt-3 flex h-6 items-end gap-1" aria-hidden>
                    {s.bars.map((b, i) => (
                      <span key={i} className="w-full rounded-sm bg-amber" style={{ height: `${b * 11}%`, opacity: 0.35 + b * 0.07 }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What sales data can't see */}
      <Section id="gap" eyebrow="What sales data can't see" title={<>Your POS shows what sold.<br /><span className="text-muted">Not what nearly did.</span></>}>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Reveal className="card p-7">
            <p className="text-xs font-bold tracking-[0.2em] text-muted uppercase">Your POS sees</p>
            <ul className="mt-5 space-y-3">
              {POS_SEES.map((t) => (
                <li key={t} className="flex gap-3 text-muted">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted" /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="card border-amber/30 p-7" delay={120}>
            <p className="eyebrow">Almost adds</p>
            <ul className="mt-5 space-y-3">
              {ALMOST_ADDS.map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber" /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Section>

      <RackFunnel />

      {/* How it works */}
      <Section id="how" eyebrow="How Almost works" title={<>One camera. One day.<br /><span className="text-amber">One ranked list.</span></>}>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} className="card flex flex-col p-6" delay={i * 90}>
              <p className="font-mono text-sm text-amber">{s.n}</p>
              <p className="display mt-4 text-2xl">{s.title}</p>
              <p className="display mt-6 text-4xl text-fg">{s.metric}</p>
              <p className="text-sm text-muted">{s.sub}</p>
              <p className="mt-5 text-sm leading-relaxed text-muted">{s.text}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Insight */}
      <Section id="insight" eyebrow="Insight" title={<>Lots of stops.<br /><span className="text-amber">Few sales.</span></>}>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          The window display rack gets 38% of all stops but only 7% of sales. Neither number means much alone. Together,
          they show exactly where shoppers lose interest.
        </p>
        <div className="mt-12 grid items-center gap-8 lg:grid-cols-[1fr_1.1fr]">
          <Reveal className="card p-6 sm:p-8">
            <p className="text-xs font-bold tracking-[0.2em] text-muted uppercase">Rack R4 · Window display · example</p>
            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
              <div>
                <p className="eyebrow">Almost</p>
                <p className="display mt-2 text-5xl">152</p>
                <p className="text-sm text-muted">stops · 38%</p>
              </div>
              <span className="display text-3xl text-muted">+</span>
              <div>
                <p className="text-xs font-bold tracking-[0.2em] text-mint uppercase">Your POS</p>
                <p className="display mt-2 text-5xl">6</p>
                <p className="text-sm text-muted">units sold · 7%</p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-amber/40 bg-amber/10 p-4">
              <span className="display text-3xl text-amber">=</span>
              <div>
                <p className="font-bold">Flagged: fix this rack first</p>
                <p className="text-sm text-muted">High attention, low conversion. The brief explains why and what to change.</p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <FloorPlan />
          </Reveal>
        </div>
        <WhatToCheck />
      </Section>

      <UseCases />
      <Categories />

      {/* Benefits */}
      <Section id="value" eyebrow="Why it matters" title={<>Visit fewer stores.<br /><span className="text-muted">Fix the right rack.</span></>}>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} className="card p-7" delay={i * 90}>
              <p className="display text-xl">{b.title}</p>
              <p className="mt-3 text-muted">{b.text}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      <Measured />
      <WhyAlmost />

      {/* Privacy */}
      <Section id="privacy" eyebrow="Privacy by design" title={<>Counts racks.<br /><span className="text-muted">Never people.</span></>}>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PRIVACY.map((p, i) => (
            <Reveal key={p.title} className="card p-7" delay={i * 90}>
              <svg viewBox="0 0 24 24" className="size-6 text-mint" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" strokeLinejoin="round" />
              </svg>
              <p className="display mt-4 text-xl">{p.title}</p>
              <p className="mt-3 text-muted">{p.text}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      <Roadmap />
      <Faq />
    </>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#" className="flex items-center gap-2.5" aria-label="Almost, back to top">
          <span className="relative flex size-7 items-center justify-center rounded-md border border-amber/60">
            <span className="size-2 rounded-full bg-amber" />
          </span>
          <span className="display text-xl tracking-tight">Almost</span>
        </a>
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="transition hover:text-fg">
              {n.label}
            </a>
          ))}
        </nav>
        <a href="#try" className="btn-primary px-4! py-2! text-sm">
          Try the demo
        </a>
      </div>
    </header>
  );
}

// A store from above: a shopper's path winds past the racks and lingers at the hot one.
function FloorPlan() {
  const path = "M300 330 L300 280 L150 250 L110 180 L140 110 L300 90 L440 120 L470 190 L455 255 L470 270";
  return (
    <figure className="card p-3">
      <svg viewBox="0 0 600 360" className="w-full" role="img" aria-label="Store floor plan: a shopper's path passes the racks and lingers at the window display rack, which gets 38% of stops but 7% of sales">
        <defs>
          <radialGradient id="heat">
            <stop offset="0%" stopColor="#ffb020" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ffb020" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect x="40" y="30" width="520" height="300" rx="10" fill="#0b0d10" stroke="white" strokeOpacity="0.15" strokeWidth="2" />
        <line x1="260" y1="330" x2="340" y2="330" stroke="#050607" strokeWidth="6" />
        <text x="300" y="352" textAnchor="middle" fill="#8b95a1" fontSize="13">Entrance</text>

        <path d="M60 50 L230 140 L130 220 Z" fill="#34d3b4" fillOpacity="0.08" />
        <rect x="50" y="42" width="22" height="14" rx="3" fill="#34d3b4" />
        <text x="80" y="54" fill="#34d3b4" fontSize="12" fontWeight="700">CCTV</text>

        <circle cx="470" cy="240" r="70" fill="url(#heat)" className="animate-heat" />

        {[
          { x: 70, y: 150, w: 26, h: 90, label: "R1" },
          { x: 250, y: 160, w: 100, h: 50, label: "R2" },
          { x: 120, y: 60, w: 110, h: 24, label: "R3" },
          { x: 500, y: 200, w: 30, h: 90, label: "R4", hot: true },
          { x: 380, y: 60, w: 110, h: 24, label: "R5" },
        ].map((r) => (
          <g key={r.label}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="4" fill={r.hot ? "#ffb020" : "#2a2f36"} />
            <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill={r.hot ? "#1a1203" : "#8b95a1"}>
              {r.label}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke="#8b95a1" className="shopper-path" strokeWidth="2.5" strokeLinecap="round" />
        <circle r="7" fill="#e8ecf1">
          <animateMotion dur="9s" repeatCount="indefinite" path={path} />
        </circle>

        <rect x="262" y="285" width="236" height="34" rx="17" fill="#e8ecf1" />
        <text x="380" y="307" textAnchor="middle" fill="#050607" fontSize="13" fontWeight="700">
          R4: 38% of stops · 7% of sales
        </text>
      </svg>
      <figcaption className="px-2 pt-2 text-sm text-muted">Illustration. Real numbers come from your footage and POS data.</figcaption>
    </figure>
  );
}
