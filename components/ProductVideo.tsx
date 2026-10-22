"use client";

// The product video: an animation of a pickup in a store, from the camera's tag to the
// screen to the day's funnel. Rendered by scripts/render_demo_video.py; it's an
// illustration, not real footage, and says so.

import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";

const STEPS = [
  { t: "0:04", text: "A shopper lifts the anarkali off the rack. The camera tags the product, not the person." },
  { t: "0:05", text: "The screen beside the rack switches to it while it's in her hand." },
  { t: "0:10", text: "She picks up the co-ord set too: a comparison, and the screen shows both." },
  { t: "0:15", text: "One goes back on the rail, one leaves with her. Each is an event with its hold time." },
  { t: "0:18", text: "At the end of the day, every pickup is joined with the POS." },
];

export default function ProductVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  // Autoplay, like a store screen, unless the viewer asked for less motion.
  useEffect(() => {
    const v = video.current;
    if (!v || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    v.play().catch(() => {});
  }, []);

  function toggle() {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  return (
    <section id="video" className="scroll-mt-16 border-t border-line">
      <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
        <Reveal>
          <p className="eyebrow">See it work</p>
          <h2 className="display mt-4 text-4xl sm:text-6xl">
            Picked up. On screen.
            <br />
            <span className="text-amber">Counted.</span>
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_18rem]">
          <Reveal className="relative overflow-hidden rounded-[18px] border border-line bg-panel">
            <video
              ref={video}
              src="/video/almost-demo.mp4"
              poster="/video/almost-demo.jpg"
              muted
              loop
              playsInline
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              className="block aspect-video w-full"
              aria-label="Animation: a shopper picks up a festive anarkali, the camera tags it, the screen beside the rack shows it, she compares it with a co-ord set, puts the anarkali back and leaves with the co-ord set; then the day's product funnel."
            />
            <button
              type="button"
              onClick={toggle}
              className="absolute top-3 left-3 rounded-full border border-white/20 bg-black/60 px-3.5 py-1.5 text-xs font-bold backdrop-blur transition hover:bg-black/80"
            >
              {playing ? "❚❚ Pause" : "▶ Play"}
            </button>
          </Reveal>
          <Reveal delay={120}>
            <ol className="space-y-5">
              {STEPS.map((s) => (
                <li key={s.t} className="flex gap-4">
                  <span className="font-mono text-sm text-amber tabular-nums">{s.t}</span>
                  <span className="text-sm text-muted">{s.text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-xs text-muted/80">
              An animation of what Almost does in a store, not real footage. The closing numbers are the sample day&apos;s.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
