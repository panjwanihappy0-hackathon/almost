// Shared building blocks for the homepage sections.

import type { ReactNode } from "react";
import Reveal from "./Reveal";

export function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-line">
      <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
        <Reveal>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="display mt-4 text-4xl sm:text-6xl">{title}</h2>
          {intro && <p className="mt-6 max-w-2xl text-lg text-muted">{intro}</p>}
        </Reveal>
        {children}
      </div>
    </section>
  );
}

// Says honestly whether a feature works in the MVP today or is planned.
export function Badge({ status }: { status: "now" | "roadmap" }) {
  return status === "now" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/40 bg-mint/10 px-2.5 py-0.5 text-[11px] font-bold tracking-[0.14em] text-mint uppercase">
      <span className="size-1.5 rounded-full bg-mint" /> Now
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/25 px-2.5 py-0.5 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
      Roadmap
    </span>
  );
}
