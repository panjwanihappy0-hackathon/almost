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
    <section id="try" className="mx-auto w-full max-w-5xl scroll-mt-6 px-4 py-16 sm:px-6">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Try it on a day of footage</h2>
      <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
        Upload the stops file from the stop counter, the same day&apos;s POS export, and up to {MAX_FRAMES} snapshot
        frames named like <code className="font-mono text-sm">rack_R4.jpg</code>.
      </p>

      <form onSubmit={onSubmit} className="mt-8 grid gap-4 sm:grid-cols-3">
        <FilePicker
          label="Stops file"
          hint="stops.csv: rack_id, hour, stops"
          accept=".csv"
          onChange={(fs) => setStops(fs[0] ?? null)}
        />
        <FilePicker
          label="POS sales file"
          hint="CSV with sku and quantity columns"
          accept=".csv"
          onChange={(fs) => setSales(fs[0] ?? null)}
        />
        <FilePicker
          label="Snapshot frames (optional)"
          hint={`Up to ${MAX_FRAMES} images, 1 MB each`}
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={setFrames}
        />
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-amber-500 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Analysing…" : "Analyse"}
          </button>
        </div>
      </form>

      {errors.length > 0 && (
        <div role="alert" className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          <p className="font-semibold">Please fix {errors.length === 1 ? "this" : "these"} and try again:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis && (
        <div className="mt-10">
          {top ? (
            <p className="text-xl font-semibold sm:text-2xl">
              <span className="text-amber-600 dark:text-amber-400">
                {top.name} ({top.rackId})
              </span>{" "}
              gets {pct(top.stopShare)} of stops but only {pct(top.salesShare)} of sales.
            </p>
          ) : (
            <p className="text-xl font-semibold">No rack stands out: stops and sales line up.</p>
          )}
          <p className="mt-1 text-sm text-zinc-500">
            {analysis.store} · {analysis.totalStops} stops · {analysis.totalUnits} units sold
          </p>

          <RackTable racks={analysis.racks} />

          {analysis.notes.map((n) => (
            <p key={n} className="mt-3 text-sm text-zinc-500">
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
  label: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  onChange: (files: File[]) => void;
}) {
  return (
    <label className="flex flex-col gap-2 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
      <span className="font-medium">{props.label}</span>
      <span className="text-sm text-zinc-500">{props.hint}</span>
      <input
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        onChange={(e) => props.onChange(Array.from(e.target.files ?? []))}
        className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm dark:file:bg-zinc-800 dark:file:text-zinc-100"
      />
    </label>
  );
}

function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-zinc-200 sm:w-24 dark:bg-zinc-800">
        <div className={`h-full ${color}`} style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      <span className="tabular-nums">{pct(share)}</span>
    </div>
  );
}

function RackTable({ racks }: { racks: RackResult[] }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
          <tr>
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Rack</th>
            <th className="px-4 py-3 font-medium">Stops</th>
            <th className="px-4 py-3 font-medium">% of stops</th>
            <th className="px-4 py-3 font-medium">Units sold</th>
            <th className="px-4 py-3 font-medium">% of sales</th>
            <th className="px-4 py-3 font-medium">Busiest hour</th>
          </tr>
        </thead>
        <tbody>
          {racks.map((r, i) => (
            <tr
              key={r.rackId}
              className={`border-t border-zinc-200 dark:border-zinc-800 ${r.flagged ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
            >
              <td className="px-4 py-3 tabular-nums">{i + 1}</td>
              <td className="px-4 py-3">
                <span className="font-medium">{r.name}</span> <span className="text-zinc-500">{r.rackId}</span>
                {r.flagged && (
                  <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-zinc-950">
                    Flagged
                  </span>
                )}
              </td>
              <td className="px-4 py-3 tabular-nums">{r.stops}</td>
              <td className="px-4 py-3">
                <ShareBar share={r.stopShare} color="bg-amber-500" />
              </td>
              <td className="px-4 py-3 tabular-nums">{r.unitsSold}</td>
              <td className="px-4 py-3">
                <ShareBar share={r.salesShare} color="bg-teal-500" />
              </td>
              <td className="px-4 py-3 tabular-nums">{r.busiestHour ?? "—"}</td>
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
    <div className="mt-12">
      <h3 className="text-xl font-semibold">Brief</h3>
      <p className="text-sm text-zinc-500">Written by AI (Gemini) from the numbers above. Check before acting.</p>

      {brief.status === "loading" && (
        <p className="mt-4 animate-pulse text-zinc-600 dark:text-zinc-400">Writing the brief…</p>
      )}
      {brief.status === "error" && (
        <p role="alert" className="mt-4 rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
          {brief.message}
        </p>
      )}
      {brief.status === "done" &&
        brief.racks.map((b) => {
          const rack = racks.find((r) => r.rackId === b.rack_id);
          const frame = frameUrls[b.rack_id];
          return (
            <article
              key={b.rack_id}
              className="mt-6 grid gap-6 rounded-2xl border border-zinc-200 p-5 sm:grid-cols-[1fr_16rem] dark:border-zinc-800"
            >
              <div>
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  {rack?.name ?? b.rack_id} · {b.rack_id}
                </p>
                <h4 className="mt-1 text-lg font-semibold">{b.headline}</h4>
                <BriefList title="Likely reasons" items={b.reasons} />
                <BriefList title="Rule these out first" items={b.other_causes} />
                <p className="mt-4 rounded-lg bg-teal-50 p-3 text-teal-950 dark:bg-teal-950/40 dark:text-teal-100">
                  <span className="font-semibold">Suggested fix: </span>
                  {b.fix}
                </p>
              </div>
              {frame ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview of the user's own file
                <img src={frame} alt={`Snapshot of rack ${b.rack_id}`} className="w-full rounded-xl object-cover" />
              ) : (
                <div className="flex items-center justify-center rounded-xl bg-zinc-100 p-6 text-sm text-zinc-500 dark:bg-zinc-900">
                  No snapshot frame uploaded for this rack
                </div>
              )}
            </article>
          );
        })}
    </div>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
