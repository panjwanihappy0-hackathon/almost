"use client";

// The pickups dashboard: events from the store device (live) or an uploaded day →
// product funnel, per-product table, compared pairs, never-touched products → Gemini brief.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductBrief } from "@/lib/gemini";
import { MAX_TOTAL_BYTES, formatMB } from "@/lib/limits";
import type { PickupReport, ProductRow } from "@/lib/pickups";
import { productBySku } from "@/lib/products";
import Garment from "./Garment";

const DEFAULT_DEVICE = "http://localhost:8765";
const LIVE_REFRESH_MS = 5000;

type Health = {
  camera: string;
  camera_ok: boolean;
  fps: number;
  mode: string;
  screens: number;
  events: { total: number; unsent: number };
  screen_reaction_ms: { median: number | null; slowest: number | null; fires: number };
  webhook?: { url: string; last_error: string | null };
};

type BriefState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; products: ProductBrief[] }
  | { status: "error"; message: string };

const pct = (share: number | null) => (share === null ? "—" : `${Math.round(share * 100)}%`);
const secs = (s: number | null) => (s === null ? "—" : `${Math.round(s)} s`);

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return res.status === 413
      ? { errors: [`The upload is too large. Keep everything under ${formatMB(MAX_TOTAL_BYTES)}.`] }
      : { errors: ["The server sent an unexpected reply. Please try again."] };
  }
}

export default function Dashboard() {
  const [mode, setMode] = useState<"live" | "upload">("upload");
  const [device, setDevice] = useState(DEFAULT_DEVICE);
  const [live, setLive] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [events, setEvents] = useState<File | null>(null);
  const [sales, setSales] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [report, setReport] = useState<PickupReport | null>(null);
  const [brief, setBrief] = useState<BriefState>({ status: "idle" });
  const lastForm = useRef<FormData | null>(null);

  // Builds the report on the server from an events file and the optional POS file.
  const analyse = useCallback(async (eventsFile: File, salesFile: File | null, quiet = false) => {
    const form = new FormData();
    form.append("events", eventsFile);
    if (salesFile) form.append("sales", salesFile);
    lastForm.current = form;
    if (!quiet) setBusy(true);
    try {
      const res = await fetch("/api/pickups", { method: "POST", body: form });
      const data = await readJson(res);
      if (!res.ok) {
        setErrors((data.errors as string[]) ?? ["Something went wrong. Please try again."]);
        if (!quiet) setReport(null);
        return;
      }
      setErrors([]);
      setReport(data as unknown as PickupReport);
    } catch {
      setErrors(["Couldn't reach the server. Check your connection and try again."]);
    } finally {
      if (!quiet) setBusy(false);
    }
  }, []);

  // Live: pull the store device's events every few seconds.
  const pull = useCallback(
    async (quiet: boolean) => {
      const base = device.replace(/\/+$/, "");
      try {
        const [h, csv] = await Promise.all([
          fetch(`${base}/health`, { cache: "no-store" }).then((r) => r.json() as Promise<Health>),
          fetch(`${base}/events.csv`, { cache: "no-store" }).then((r) => r.text()),
        ]);
        setHealth(h);
        if (csv.trim().split("\n").length < 2) {
          setErrors([]);
          setReport(null);
          return;
        }
        await analyse(new File([csv], "events.csv", { type: "text/csv" }), sales, quiet);
      } catch {
        setHealth(null);
        setErrors([
          `Can't reach the store device at ${base}. Start it with "python detector/pickups.py run" ` +
            `(or "simulate" to try it without a camera), then connect again.`,
        ]);
      }
    },
    [device, sales, analyse],
  );

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => pull(true), LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [live, pull]);

  async function connect() {
    setBrief({ status: "idle" });
    setBusy(true);
    await pull(false);
    setBusy(false);
    setLive(true);
  }

  async function useSample() {
    setLive(false);
    setBrief({ status: "idle" });
    const [ev, pos] = await Promise.all(
      ["events.csv", "pos.csv"].map(async (name) => {
        const text = await fetch(`/samples/${name}`).then((r) => r.text());
        return new File([text], name, { type: "text/csv" });
      }),
    );
    setEvents(ev);
    setSales(pos);
    await analyse(ev, pos);
  }

  async function onUpload() {
    setLive(false);
    setBrief({ status: "idle" });
    if (!events) {
      setErrors(["Events file: no file chosen."]);
      return;
    }
    if (events.size + (sales?.size ?? 0) > MAX_TOTAL_BYTES) {
      setErrors([`The files together are over ${formatMB(MAX_TOTAL_BYTES)}.`]);
      return;
    }
    await analyse(events, sales);
  }

  async function writeBrief() {
    if (!lastForm.current) return;
    setBrief({ status: "loading" });
    try {
      const res = await fetch("/api/pickups/brief", { method: "POST", body: lastForm.current });
      const data = await readJson(res);
      setBrief(
        res.ok
          ? { status: "done", products: data.products as ProductBrief[] }
          : { status: "error", message: (data.error as string) ?? "Brief unavailable. Try again." },
      );
    } catch {
      setBrief({ status: "error", message: "Brief unavailable. Try again." });
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow">Product pickups</p>
      <h1 className="display mt-4 text-4xl sm:text-6xl">
        What shoppers pick up,
        <br />
        <span className="text-amber">and what goes back.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted">
        A camera beside the rack sees which product is in a shopper&apos;s hand, how long it&apos;s held and whether it
        goes back on the shelf. Add the day&apos;s POS export to see which of those pickups became sales.
      </p>

      <div className="mt-10 inline-flex rounded-full border border-line p-1 text-sm font-bold">
        {(["upload", "live"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-2 transition ${mode === m ? "bg-amber text-amber-ink" : "text-muted hover:text-fg"}`}
          >
            {m === "upload" ? "Upload a day" : "Live from the store device"}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {mode === "live" ? (
          <div className="card flex flex-col gap-3 p-6 md:col-span-2">
            <span className="font-mono text-sm text-amber">01</span>
            <span className="display text-xl">Store device</span>
            <span className="text-sm text-muted">
              Where <code className="font-mono text-fg">detector/pickups.py run</code> (or <code className="font-mono text-fg">simulate</code>) is running.
            </span>
            <div className="mt-2 flex flex-wrap gap-3">
              <input
                value={device}
                onChange={(e) => {
                  setDevice(e.target.value);
                  setLive(false);
                }}
                className="min-w-0 flex-1 rounded-full border border-line bg-panel px-4 py-2.5 font-mono text-sm outline-none focus:border-amber/60"
                aria-label="Store device address"
              />
              <button type="button" onClick={connect} disabled={busy} className="btn-primary py-2.5!">
                {live ? "Refresh" : "Connect"}
              </button>
            </div>
            {live && health && <HealthLine health={health} />}
          </div>
        ) : (
          <FilePicker step="01" label="Events file" hint="events.csv from pickups.py export" file={events} onChange={setEvents} />
        )}
        <FilePicker step="02" label="POS sales file" hint="Optional · CSV with sku and quantity" file={sales} onChange={setSales} />
        {mode === "upload" && (
          <div className="flex flex-wrap items-center gap-3 md:col-span-3">
            <button type="button" onClick={onUpload} disabled={busy} className="btn-primary">
              {busy ? "Working…" : <>Build the report <span aria-hidden>→</span></>}
            </button>
            <button type="button" onClick={useSample} disabled={busy} className="btn-ghost">
              Try the sample day
            </button>
          </div>
        )}
      </div>

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

      {live && !report && errors.length === 0 && (
        <p className="card mt-8 p-6 text-muted">Connected. No pickups yet: pick something up in front of the camera.</p>
      )}

      {report && <Report report={report} live={live} brief={brief} onBrief={writeBrief} />}
    </section>
  );
}

function HealthLine({ health }: { health: Health }) {
  const r = health.screen_reaction_ms;
  return (
    <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
      <span className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${health.camera_ok ? "animate-pulse bg-mint" : "bg-red-400"}`} />
        {health.camera} · {health.camera_ok ? `${health.fps} fps` : "camera lost"}
      </span>
      <span>{health.events.total} events</span>
      {health.webhook && <span>{health.events.unsent} waiting to send{health.webhook.last_error ? " (offline)" : ""}</span>}
      <span>{health.screens} screen{health.screens === 1 ? "" : "s"}</span>
      {r.median !== null && (
        <span title="From the device deciding which product is in hand to the screen reporting it painted it">
          screen reaction {r.median} ms median ({r.fires} fires)
        </span>
      )}
    </p>
  );
}

function FilePicker(props: { step: string; label: string; hint: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <label className={`card relative flex cursor-pointer flex-col gap-2 p-6 transition hover:border-amber/50 ${props.file ? "border-amber/50" : "border-dashed"}`}>
      <span className="font-mono text-sm text-amber">{props.step}</span>
      <span className="display text-xl">{props.label}</span>
      <span className="text-sm text-muted">{props.hint}</span>
      <span className={`mt-3 truncate text-sm ${props.file ? "text-fg" : "text-muted"}`}>
        {props.file ? `✓ ${props.file.name}` : "Click to choose a file"}
      </span>
      <input
        type="file"
        accept=".csv"
        onChange={(e) => props.onChange(e.target.files?.[0] ?? null)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function Report({ report, live, brief, onBrief }: { report: PickupReport; live: boolean; brief: BriefState; onBrief: () => void }) {
  const f = report.funnel;
  const top = report.products
    .filter((p) => p.flagged)
    .sort((a, b) => b.pickupShare - (b.salesShare ?? 0) - (a.pickupShare - (a.salesShare ?? 0)))[0];
  const flaggedCount = report.products.filter((p) => p.flagged).length;

  return (
    <div className="mt-14">
      <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">
        {live ? "Live · " : ""}
        {report.days.join(", ")} · {f.onShelf} products watched · {f.pickedUp} pickups
        {f.purchased !== null ? ` · ${f.purchased} units sold` : ""}
      </p>

      {top && <Insight row={top} pairs={report.pairs} />}

      <Funnel funnel={f} />

      <div className="mt-4 flex items-center justify-between gap-4">
        <h2 className="display text-2xl sm:text-3xl">Every product</h2>
        <button type="button" className="btn-ghost px-4! py-2! text-sm" onClick={() => downloadCsv(report.products)}>
          Export CSV
        </button>
      </div>
      <ProductTable rows={report.products} hasSales={report.hasSales} />
      {report.notes.map((n) => (
        <p key={n} className="mt-3 text-sm text-muted">
          Note: {n}
        </p>
      ))}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card p-6">
          <p className="eyebrow">Compared together</p>
          <p className="mt-2 text-sm text-muted">Picked up by the same shopper within 30 seconds.</p>
          {report.pairs.length === 0 ? (
            <p className="mt-5 text-sm text-muted">No comparisons yet.</p>
          ) : (
            <ul className="mt-5 space-y-3">
              {report.pairs.map((p) => (
                <li key={p.a + p.b} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {productBySku.get(p.a)?.name} <span className="text-muted">vs</span> {productBySku.get(p.b)?.name}
                  </span>
                  <span className="font-mono text-amber tabular-nums">{p.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-6">
          <p className="eyebrow">Never touched</p>
          <p className="mt-2 text-sm text-muted">On a watched rack, and not picked up once.</p>
          {report.neverTouched.length === 0 ? (
            <p className="mt-5 text-sm text-muted">Every product was picked up at least once.</p>
          ) : (
            <ul className="mt-5 space-y-3">
              {report.neverTouched.map((p) => (
                <li key={p.sku} className="text-sm">
                  {p.name} <span className="text-muted">· {p.colour} · {p.rackName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <HourChart hours={report.hours} />
      </div>

      {report.hasSales && (
        <div className="mt-16">
          <p className="eyebrow">AI brief</p>
          <h2 className="display mt-3 text-3xl sm:text-4xl">Why they put it back</h2>
          {flaggedCount === 0 ? (
            <p className="card mt-6 p-6 text-muted">No product stands out: pickups and sales line up.</p>
          ) : brief.status === "idle" ? (
            <button type="button" onClick={onBrief} className="btn-primary mt-6">
              Write the brief for {flaggedCount} flagged product{flaggedCount === 1 ? "" : "s"} <span aria-hidden>→</span>
            </button>
          ) : (
            <BriefCards brief={brief} rows={report.products} />
          )}
        </div>
      )}
    </div>
  );
}

function Insight({ row, pairs }: { row: ProductRow; pairs: PickupReport["pairs"] }) {
  const product = productBySku.get(row.sku);
  const pair = pairs.find((p) => p.a === row.sku || p.b === row.sku);
  const other = pair ? productBySku.get(pair.a === row.sku ? pair.b : pair.a) : null;
  const checks = [
    "Check the price",
    "Check size availability",
    "Check stock behind the rack",
    "Try it on a different rack",
    other ? `See why it loses to the ${other.name}` : "See which products it's compared with",
  ];
  return (
    <div className="card mt-4 grid gap-8 p-6 sm:p-8 lg:grid-cols-[14rem_1fr]">
      <div className="flex items-center justify-center rounded-2xl border border-line bg-panel p-6">
        {product && <Garment kind={product.kind} hex={product.hex} className="h-44 w-44" />}
      </div>
      <div>
        <p className="text-xs font-bold tracking-[0.18em] text-amber uppercase">High interest · low conversion</p>
        <p className="display mt-4 text-3xl sm:text-4xl">
          <span className="text-amber">{row.name}</span> is picked up {row.pickups} times and held {secs(row.avgHoldS)} on
          average. The POS shows only <span className="text-mint">{row.unitsSold}</span> sold.
        </p>
        <p className="mt-4 text-muted">
          {pct(row.pickupShare)} of all pickups, {pct(row.salesShare)} of sales. {pct(row.putBackRate)} of pickups go
          straight back on the shelf.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {checks.map((c) => (
            <span key={c} className="rounded-full border border-line px-3 py-1.5 text-sm text-fg/90">
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Funnel({ funnel: f }: { funnel: PickupReport["funnel"] }) {
  const ofPickups = (n: number) => (f.pickedUp ? `${Math.round((n / f.pickedUp) * 100)}% of pickups` : "");
  const steps = [
    { n: "01", title: "On the shelf", value: `${f.onShelf}`, sub: "products in view", bar: 1 },
    { n: "02", title: "Picked up", value: `${f.pickedUp}`, sub: "pickups", bar: 1 },
    { n: "03", title: "Held", value: secs(f.avgHoldS), sub: "on average", bar: 1 },
    { n: "04", title: "Compared", value: `${f.compared}`, sub: ofPickups(f.compared * 2), bar: f.pickedUp ? (f.compared * 2) / f.pickedUp : 0 },
    { n: "05", title: "Put back", value: `${f.putBack}`, sub: ofPickups(f.putBack), bar: f.pickedUp ? f.putBack / f.pickedUp : 0 },
    {
      n: "06",
      title: "Purchased",
      value: f.purchased === null ? "—" : `${f.purchased}`,
      sub: f.purchased === null ? "add a POS file" : `units, from your POS · ${ofPickups(f.purchased)}`,
      bar: f.purchased !== null && f.pickedUp ? f.purchased / f.pickedUp : 0,
      mint: true,
    },
  ];
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {steps.map((s) => (
        <div key={s.n} className="card flex flex-col p-5">
          <span className="font-mono text-xs text-muted">{s.n}</span>
          <span className="mt-1 text-sm font-semibold">{s.title}</span>
          <span className={`display mt-4 text-3xl ${s.mint ? "text-mint" : ""}`}>{s.value}</span>
          <span className="mt-1 text-xs text-muted">{s.sub}</span>
          <div className="mt-auto pt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full ${s.mint ? "bg-mint" : "bg-amber"}`} style={{ width: `${Math.min(100, Math.round(s.bar * 100))}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductTable({ rows, hasSales }: { rows: ProductRow[]; hasSales: boolean }) {
  return (
    <div className="card mt-4 overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="text-xs tracking-[0.14em] text-muted uppercase">
          <tr>
            <th className="px-5 py-4 font-bold">Product</th>
            <th className="px-5 py-4 font-bold">Pickups</th>
            <th className="px-5 py-4 font-bold">Avg. hold</th>
            <th className="px-5 py-4 font-bold">Put-back rate</th>
            <th className="px-5 py-4 font-bold">Compared</th>
            <th className="px-5 py-4 font-bold">Sold</th>
            <th className="px-5 py-4 font-bold" title="Units sold for every 100 pickups">Sold / 100 pickups</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sku} className={`border-t border-line ${r.flagged ? "bg-amber/[0.07]" : ""}`}>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="size-3.5 shrink-0 rounded-full border border-white/20" style={{ background: r.hex }} />
                  <div>
                    <span className="font-semibold">{r.name}</span>
                    {r.flagged && <span className="ml-2 rounded-full bg-amber px-2.5 py-0.5 text-xs font-bold text-amber-ink">Flagged</span>}
                    <p className="text-xs text-muted">
                      {r.colour} · {r.sku} · {r.rackName}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10 sm:w-20">
                    <div className="h-full rounded-full bg-amber" style={{ width: `${Math.round(r.pickupShare * 100)}%` }} />
                  </div>
                  <span className="tabular-nums">{r.pickups}</span>
                </div>
              </td>
              <td className="px-5 py-3.5 tabular-nums">{secs(r.avgHoldS)}</td>
              <td className="px-5 py-3.5 tabular-nums">{pct(r.putBackRate)}</td>
              <td className="px-5 py-3.5 tabular-nums">{r.compared}</td>
              <td className="px-5 py-3.5 tabular-nums">{hasSales ? r.unitsSold : "—"}</td>
              <td className={`px-5 py-3.5 tabular-nums ${r.flagged ? "font-semibold text-amber" : ""}`}>{r.soldPer100Pickups ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HourChart({ hours }: { hours: PickupReport["hours"] }) {
  const max = Math.max(1, ...hours.map((h) => h.pickups));
  return (
    <div className="card p-6">
      <p className="eyebrow">Hour by hour</p>
      <p className="mt-2 text-sm text-muted">Pickups across the day.</p>
      <div className="mt-5 flex h-36 items-end gap-2">
        {hours.map((h) => (
          <div key={h.hour} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${h.hour}: ${h.pickups} pickups`}>
            <span className="text-xs text-muted tabular-nums">{h.pickups}</span>
            <div className="w-full rounded-t-md bg-amber" style={{ height: `${(h.pickups / max) * 100}%`, minHeight: 2 }} />
            <span className="text-[11px] text-muted tabular-nums">{h.hour.slice(0, 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BriefCards({ brief, rows }: { brief: BriefState; rows: ProductRow[] }) {
  if (brief.status === "loading") {
    return (
      <div className="card mt-6 flex items-center gap-3 p-6 text-muted">
        <span className="size-2 animate-pulse rounded-full bg-amber" />
        Writing the brief… this takes 10–20 seconds.
      </div>
    );
  }
  if (brief.status === "error") {
    return (
      <p role="alert" className="card mt-6 p-6">
        {brief.message}
      </p>
    );
  }
  if (brief.status !== "done") return null;
  return (
    <>
      <p className="mt-2 text-sm text-muted">Written by AI (Gemini) from the numbers above. Check before acting.</p>
      {brief.products.map((b) => {
        const row = rows.find((r) => r.sku === b.sku);
        const product = productBySku.get(b.sku);
        return (
          <article key={b.sku} className="card mt-6 grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_12rem]">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-amber uppercase">
                {row?.name ?? b.sku} · {row?.colour} · {b.sku}
              </p>
              <h3 className="display mt-3 text-2xl">{b.headline}</h3>
              <BriefList title="Likely reasons" items={b.reasons} dot="bg-amber" />
              <BriefList title="Rule these out first" items={b.other_causes} dot="bg-muted" />
              <div className="mt-6 rounded-2xl border border-mint/40 bg-mint/10 p-4">
                <p className="text-xs font-bold tracking-[0.18em] text-mint uppercase">Suggested fix</p>
                <p className="mt-1.5">{b.fix}</p>
              </div>
            </div>
            {product && (
              <div className="flex items-start justify-center">
                <Garment kind={product.kind} hex={product.hex} className="h-40 w-40" />
              </div>
            )}
          </article>
        );
      })}
    </>
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

function downloadCsv(rows: ProductRow[]) {
  const cols = ["sku", "name", "colour", "rack", "pickups", "avg_hold_s", "put_backs", "put_back_rate", "taken", "compared", "units_sold", "sold_per_100_pickups", "flagged"];
  const cell = (v: unknown) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = rows.map((r) =>
    [r.sku, r.name, r.colour, r.rack, r.pickups, r.avgHoldS, r.putBacks, r.putBackRate === null ? null : r.putBackRate.toFixed(2), r.taken, r.compared, r.unitsSold, r.soldPer100Pickups, r.flagged].map(cell).join(","),
  );
  const blob = new Blob([[cols.join(","), ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "almost-products.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
