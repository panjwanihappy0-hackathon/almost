"use client";

// The demo itself: pick files → Analyse → ranked rack table → Gemini brief.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { RackBrief } from "@/lib/gemini";
import type { RackResult } from "@/lib/join";
import { MAX_FRAMES, MAX_TOTAL_BYTES, formatMB } from "@/lib/limits";

type Analysis = {
  store: string;
  racks: RackResult[];
  totalStops: number;
  totalUnits: number;
  notes: string[];
};

type BriefState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; racks: RackBrief[] }
  | { status: "error"; message: string };

const pct = (share: number) => `${Math.round(share * 100)}%`;

// Reads a JSON reply, even when the server sent back something else (e.g. "request too large").
async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return res.status === 413
      ? { errors: [`The upload is too large. Keep everything under ${formatMB(MAX_TOTAL_BYTES)}.`] }
      : { errors: ["The server sent an unexpected reply. Please try again."] };
  }
}

export default function Analyzer() {
  const [stops, setStops] = useState<File | null>(null);
  const [sales, setSales] = useState<File | null>(null);
  const [frames, setFrames] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [brief, setBrief] = useState<BriefState>({ status: "idle" });

  // Preview links for the chosen frames, keyed by rack ID ("rack_R4.jpg" → "R4").
  const frameUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    for (const f of frames) {
      const m = f.name.match(/^rack_(.+)\.(jpe?g|png|webp)$/i);
      if (m) urls[m[1]] = URL.createObjectURL(f);
    }
    return urls;
  }, [frames]);
  useEffect(() => () => Object.values(frameUrls).forEach((u) => URL.revokeObjectURL(u)), [frameUrls]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);
    setAnalysis(null);
    setBrief({ status: "idle" });

    // Quick checks before uploading; the server checks everything again.
    const quick: string[] = [];
    if (!stops) quick.push("Stops file: no file chosen.");
    if (!sales) quick.push("POS sales file: no file chosen.");
    if (frames.length > MAX_FRAMES) quick.push(`Snapshot frames: ${frames.length} chosen; the limit is ${MAX_FRAMES}.`);
    const total = (stops?.size ?? 0) + (sales?.size ?? 0) + frames.reduce((a, f) => a + f.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      quick.push(`All files together are ${formatMB(total)}; the limit is ${formatMB(MAX_TOTAL_BYTES)}.`);
    }
    if (quick.length > 0) {
      setErrors(quick);
      return;
    }

    const form = new FormData();
    form.append("stops", stops!);
    form.append("sales", sales!);
    frames.forEach((f) => form.append("frames", f));

    setBusy(true);
    try {
      // 1. The table: plain code, comes back fast.
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await readJson(res);
      if (!res.ok) {
        setErrors((data.errors as string[]) ?? ["Something went wrong. Please try again."]);
        return;
      }
      const result = data as unknown as Analysis;
      setAnalysis(result);

      // 2. The brief: Gemini, only if something was flagged.
      if (!result.racks.some((r) => r.flagged)) return;
      setBrief({ status: "loading" });
      const briefRes = await fetch("/api/brief", { method: "POST", body: form });
      const briefData = await readJson(briefRes);
      setBrief(
        briefRes.ok
          ? { status: "done", racks: briefData.racks as RackBrief[] }
          : { status: "error", message: (briefData.error as string) ?? "Brief unavailable. Try again." },
      );
    } catch {
      setErrors(["Couldn't reach the server. Check your connection and try again."]);
      setBrief((b) => (b.status === "loading" ? { status: "error", message: "Brief unavailable. Try again." } : b));
    } finally {
      setBusy(false);
    }
  }

  const top = analysis?.racks.find((r) => r.flagged);

  return (
    <section id="try" className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 py-24 sm:px-6">
      <p className="eyebrow">Live demo</p>
      <h2 className="display mt-4 text-4xl sm:text-6xl">
        Try it on a day
        <br />
        <span className="text-amber">of footage.</span>
      </h2>
      <p className="mt-6 max-w-2xl text-lg text-muted">
        Upload the stops file from the stop counter, the same day&apos;s POS export, and up to {MAX_FRAMES} snapshot
        frames named like <code className="font-mono text-base text-fg">rack_R4.jpg</code>.
      </p>

      <form onSubmit={onSubmit} className="mt-10 grid gap-4 md:grid-cols-3">
        <FilePicker
          step="01"
          label="Stops file"
          hint="stops.csv: rack_id, hour, stops"
          accept=".csv"
          files={stops ? [stops] : []}
          onChange={(fs) => setStops(fs[0] ?? null)}
        />
        <FilePicker
          step="02"
          label="POS sales file"
          hint="CSV with sku and quantity columns"
          accept=".csv"
          files={sales ? [sales] : []}
          onChange={(fs) => setSales(fs[0] ?? null)}
        />
        <FilePicker
          step="03"
          label="Snapshot frames"
          hint={`Optional · up to ${MAX_FRAMES} images, 1 MB each`}
          accept="image/jpeg,image/png,image/webp"
          multiple
          files={frames}
          onChange={setFrames}
        />
        <div className="md:col-span-3">
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? "Analysing…" : <>Analyse <span aria-hidden>→</span></>}
          </button>
        </div>
      </form>

      {errors.length > 0 && (
        <div role="alert" className="mt-8 rounded-2xl border border-red-500/40 bg-red-500/10 p-5 text-red-200">
          <p className="font-bold text-red-100">Please fix {errors.length === 1 ? "this" : "these"} and try again:</p>
          <ul className="mt-3 space-y-1.5">
            {errors.map((e) => (
              <li key={e} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-red-400" /> {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis && (
        <div className="mt-14">
          <div className="card p-6 sm:p-8">
            <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">
              {analysis.store} · {analysis.totalStops} stops · {analysis.totalUnits} units sold
            </p>
            {top ? (
              <p className="display mt-4 text-3xl sm:text-5xl">
                <span className="text-amber">{top.name}</span> gets {pct(top.stopShare)} of stops but only{" "}
                <span className="text-mint">{pct(top.salesShare)}</span> of sales.
              </p>
            ) : (
              <p className="display mt-4 text-3xl sm:text-4xl">No rack stands out: stops and sales line up.</p>
            )}
          </div>

          <RackTable racks={analysis.racks} />

          {analysis.notes.map((n) => (
            <p key={n} className="mt-3 text-sm text-muted">
              Note: {n}
            </p>
          ))}

          <BriefSection brief={brief} racks={analysis.racks} frameUrls={frameUrls} />
        </div>
      )}
    </section>
  );
}

function FilePicker(props: {
  step: string;
  label: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const chosen = props.files.map((f) => f.name).join(", ");
  return (
    <label
      className={`card group relative flex cursor-pointer flex-col gap-2 p-6 transition hover:border-amber/50 ${
        chosen ? "border-amber/50" : "border-dashed"
      }`}
    >
      <span className="font-mono text-sm text-amber">{props.step}</span>
      <span className="display text-xl">{props.label}</span>
      <span className="text-sm text-muted">{props.hint}</span>
      <span className={`mt-3 truncate text-sm ${chosen ? "text-fg" : "text-muted"}`}>
        {chosen ? `✓ ${chosen}` : "Click to choose a file"}
      </span>
      <input
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        onChange={(e) => props.onChange(Array.from(e.target.files ?? []))}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10 sm:w-24">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      <span className="tabular-nums">{pct(share)}</span>
    </div>
  );
}

function RackTable({ racks }: { racks: RackResult[] }) {
  return (
    <div className="card mt-4 overflow-x-auto">
      <table className="w-full min-w-[780px] text-left text-sm">
        <thead className="text-xs tracking-[0.14em] text-muted uppercase">
          <tr>
            <th className="px-5 py-4 font-bold">#</th>
            <th className="px-5 py-4 font-bold">Rack</th>
            <th className="px-5 py-4 font-bold">Stops</th>
            <th className="px-5 py-4 font-bold">% of stops</th>
            <th className="px-5 py-4 font-bold">Units sold</th>
            <th className="px-5 py-4 font-bold">% of sales</th>
            <th className="px-5 py-4 font-bold" title="Units sold for every 100 stops at this rack">Sales / 100 stops</th>
            <th className="px-5 py-4 font-bold">Busiest hour</th>
          </tr>
        </thead>
        <tbody>
          {racks.map((r, i) => (
            <tr key={r.rackId} className={`border-t border-line ${r.flagged ? "bg-amber/[0.07]" : ""}`}>
              <td className="px-5 py-4 font-mono text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</td>
              <td className="px-5 py-4">
                <span className="font-semibold">{r.name}</span> <span className="text-muted">{r.rackId}</span>
                {r.flagged && (
                  <span className="ml-2 rounded-full bg-amber px-2.5 py-0.5 text-xs font-bold text-amber-ink">Flagged</span>
                )}
              </td>
              <td className="px-5 py-4 tabular-nums">{r.stops}</td>
              <td className="px-5 py-4">
                <ShareBar share={r.stopShare} color="bg-amber" />
              </td>
              <td className="px-5 py-4 tabular-nums">{r.unitsSold}</td>
              <td className="px-5 py-4">
                <ShareBar share={r.salesShare} color="bg-mint" />
              </td>
              <td className={`px-5 py-4 tabular-nums ${r.flagged ? "font-semibold text-amber" : ""}`}>
                {r.salesPer100Stops ?? "—"}
              </td>
              <td className="px-5 py-4 tabular-nums text-muted">{r.busiestHour ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BriefSection({
  brief,
  racks,
  frameUrls,
}: {
  brief: BriefState;
  racks: RackResult[];
  frameUrls: Record<string, string>;
}) {
  if (brief.status === "idle") return null;
  return (
    <div className="mt-16">
      <p className="eyebrow">AI brief</p>
      <h3 className="display mt-3 text-3xl sm:text-4xl">What to fix this week</h3>
      <p className="mt-2 text-sm text-muted">Written by AI (Gemini) from the numbers above. Check before acting.</p>

      {brief.status === "loading" && (
        <div className="card mt-6 flex items-center gap-3 p-6 text-muted">
          <span className="size-2 animate-pulse rounded-full bg-amber" />
          Writing the brief… this takes 10–20 seconds.
        </div>
      )}
      {brief.status === "error" && (
        <p role="alert" className="card mt-6 p-6">
          {brief.message}
        </p>
      )}
      {brief.status === "done" &&
        brief.racks.map((b) => {
          const rack = racks.find((r) => r.rackId === b.rack_id);
          const frame = frameUrls[b.rack_id];
          return (
            <article key={b.rack_id} className="card mt-6 grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_20rem]">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-amber uppercase">
                  {rack?.name ?? b.rack_id} · {b.rack_id}
                </p>
                <h4 className="display mt-3 text-2xl">{b.headline}</h4>
                <BriefList title="Likely reasons" items={b.reasons} dot="bg-amber" />
                <BriefList title="Rule these out first" items={b.other_causes} dot="bg-muted" />
                <div className="mt-6 rounded-2xl border border-mint/40 bg-mint/10 p-4">
                  <p className="text-xs font-bold tracking-[0.18em] text-mint uppercase">Suggested fix</p>
                  <p className="mt-1.5">{b.fix}</p>
                </div>
              </div>
              {frame ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview of the user's own file
                <img src={frame} alt={`Snapshot of rack ${b.rack_id}`} className="w-full rounded-xl border border-line object-cover" />
              ) : (
                <div className="flex min-h-40 items-center justify-center self-start rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
                  No snapshot frame uploaded for this rack
                </div>
              )}
            </article>
          );
        })}
    </div>
  );
}

function BriefList({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  return (
    <div className="mt-6">
      <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">{title}</p>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-fg/90">
            <span className={`mt-2 size-1.5 shrink-0 rounded-full ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
