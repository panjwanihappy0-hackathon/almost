// The homepage explainer: what Almost does, before the live demo below it.
// Plain content only: no data, no AI.

const STEPS = [
  {
    title: "Watch",
    text: "The CCTV camera you already have records the floor as usual. No new hardware.",
    icon: (
      <path d="M3 7h11v10H3zM14 10l6-3v10l-6-3" strokeLinejoin="round" />
    ),
  },
  {
    title: "Understand",
    text: "AI follows each shopper anonymously as they move: where they stop, how long they stay, which racks they walk past. That shows what caught their interest, which sales data can't.",
    icon: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  {
    title: "Compare",
    text: "Stops are matched with till sales, so racks that win attention but don't sell stand out.",
    icon: <path d="M5 20V10M12 20V4M19 20v-7" strokeLinecap="round" />,
  },
  {
    title: "Act",
    text: "An AI brief explains likely reasons and suggests a fix: move a rack, change a display, restock a size. Shelves get rearranged on evidence, not guesswork.",
    icon: <path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />,
  },
];

const BENEFITS = [
  { title: "Fewer store visits", text: "Go only where the data points, with an agenda." },
  { title: "Layouts backed by behaviour", text: "Shelf and display changes rest on what shoppers actually did." },
  { title: "Every fix checked", text: "Each suggestion comes with the numbers behind it." },
];

export default function HowItWorks() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto w-full max-w-5xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
        <p className="font-semibold tracking-wide text-amber-600 dark:text-amber-400">Almost</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Your CCTV already sees why shoppers don&apos;t buy. Almost makes it tell you.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          Sales reports show what sold. Almost shows which racks shoppers stopped at, and walked away from, so you
          know what to fix in each store.
        </p>
        <a
          href="#try"
          className="mt-8 inline-block rounded-full bg-amber-500 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-amber-400"
        >
          Try it on a day of footage ↓
        </a>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
        <div className="mt-8 grid items-center gap-10 lg:grid-cols-2">
          <ol className="space-y-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    {step.icon}
                  </svg>
                </span>
                <div>
                  <p className="font-semibold">
                    {i + 1}. {step.title}
                  </p>
                  <p className="mt-1 text-zinc-600 dark:text-zinc-400">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <FloorPlan />
        </div>
      </section>

      {/* What the business gets */}
      <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What the business gets</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
              <p className="font-semibold">{b.title}</p>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">{b.text}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 flex items-start gap-3 rounded-2xl bg-zinc-100 p-4 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" strokeLinejoin="round" />
          </svg>
          <span>
            <span className="font-semibold">Private by design.</span> No faces stored, and no one is identified.
            Only anonymous counts leave the store.
          </span>
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-teal-300 p-5 dark:border-teal-800">
            <p className="text-sm font-semibold text-teal-700 dark:text-teal-300">TODAY</p>
            <p className="mt-1">Analyses a recorded day of footage from one camera, joined with that day&apos;s POS sales.</p>
          </div>
          <div className="rounded-2xl border border-dashed border-zinc-300 p-5 dark:border-zinc-700">
            <p className="text-sm font-semibold text-zinc-500">NEXT</p>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Near real-time analysis on an in-store box, every camera, every store, with before/after checks on
              each fix.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

// A store from above: a shopper's path winds past the racks and lingers at the hot one.
function FloorPlan() {
  const path = "M300 330 L300 280 L150 250 L110 180 L140 110 L300 90 L440 120 L470 190 L455 255 L470 270";
  return (
    <figure className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <svg viewBox="0 0 600 360" className="w-full" role="img" aria-label="Store floor plan: a shopper's path passes the racks and lingers at the window display rack, which gets 38% of stops but 6% of sales">
        <defs>
          <radialGradient id="heat">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Walls and entrance */}
        <rect x="40" y="30" width="520" height="300" rx="10" className="fill-white stroke-zinc-300 dark:fill-zinc-950 dark:stroke-zinc-700" strokeWidth="2" />
        <line x1="260" y1="330" x2="340" y2="330" className="stroke-zinc-50 dark:stroke-zinc-900" strokeWidth="6" />
        <text x="300" y="352" textAnchor="middle" className="fill-zinc-400 text-[13px]">Entrance</text>

        {/* Camera and its view */}
        <path d="M60 50 L230 140 L130 220 Z" className="fill-teal-500/10" />
        <rect x="50" y="42" width="22" height="14" rx="3" className="fill-teal-600" />
        <text x="80" y="54" className="fill-teal-700 text-[12px] dark:fill-teal-300">CCTV</text>

        {/* Heat where shoppers linger */}
        <circle cx="470" cy="240" r="70" fill="url(#heat)" className="animate-heat" />

        {/* Racks */}
        {[
          { x: 70, y: 150, w: 26, h: 90, label: "R1" },
          { x: 250, y: 160, w: 100, h: 50, label: "R2" },
          { x: 120, y: 60, w: 110, h: 24, label: "R3" },
          { x: 500, y: 200, w: 30, h: 90, label: "R4", hot: true },
          { x: 380, y: 60, w: 110, h: 24, label: "R5" },
        ].map((r) => (
          <g key={r.label}>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx="4"
              className={r.hot ? "fill-amber-500" : "fill-zinc-300 dark:fill-zinc-700"}
            />
            <text
              x={r.x + r.w / 2}
              y={r.y + r.h / 2 + 5}
              textAnchor="middle"
              className={`text-[13px] font-semibold ${r.hot ? "fill-zinc-950" : "fill-zinc-600 dark:fill-zinc-300"}`}
            >
              {r.label}
            </text>
          </g>
        ))}

        {/* Shopper path and walking shopper */}
        <path d={path} fill="none" className="stroke-zinc-500 shopper-path" strokeWidth="2.5" strokeLinecap="round" />
        <circle r="7" className="fill-zinc-900 dark:fill-zinc-100">
          <animateMotion dur="9s" repeatCount="indefinite" path={path} />
        </circle>

        {/* Callout */}
        <g>
          <rect x="300" y="285" width="180" height="34" rx="17" className="fill-zinc-900 dark:fill-zinc-100" />
          <text x="390" y="307" textAnchor="middle" className="fill-white text-[13px] font-semibold dark:fill-zinc-900">
            R4: 38% of stops · 6% of sales
          </text>
        </g>
      </svg>
      <figcaption className="px-2 pt-2 text-sm text-zinc-500">
        Illustration. Real numbers come from your footage and POS data.
      </figcaption>
    </figure>
  );
}
