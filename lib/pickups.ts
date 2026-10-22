// Reads the pickup detector's events and builds the product report: the product funnel,
// per-product numbers, products compared together, never-touched products and the hour-by-hour
// curve. Plain arithmetic, no AI: the same files always give the same report.

import Papa from "papaparse";
import { MIN_PICKUP_SHARE, SALES_TO_PICKUPS_RATIO } from "./limits";
import type { SaleRow } from "./parse";
import { productBySku, products, rackName } from "./products";

export const EVENT_TYPES = ["pickup", "put_back", "taken", "compare"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_COLUMNS = ["ts", "type", "sku", "zone"];

export type PickupEvent = {
  ts: string; // local time, e.g. "2026-10-21T11:02:13"
  type: EventType;
  sku: string;
  zone: string;
  holdS: number | null;
  otherSku: string | null;
};

const MAX_ROW_ERRORS = 5;

export function parseEvents(text: string): { rows: PickupEvent[]; errors: string[] } {
  const label = "Events file";
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const fields = result.meta.fields ?? [];
  const missing = EVENT_COLUMNS.filter((c) => !fields.includes(c));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        `${label}: missing the column${missing.length > 1 ? "s" : ""} ${missing.map((c) => `"${c}"`).join(", ")}. ` +
          `Columns found: ${fields.join(", ") || "none"}. Export it with: python detector/pickups.py export`,
      ],
    };
  }

  const rows: PickupEvent[] = [];
  const rowErrors: string[] = [];
  const unknownSkus = new Set<string>();
  result.data.forEach((raw, i) => {
    const line = i + 2;
    const ts = (raw.ts ?? "").trim();
    const type = (raw.type ?? "").trim() as EventType;
    const sku = (raw.sku ?? "").trim().toUpperCase();
    const otherSku = (raw.other_sku ?? "").trim().toUpperCase() || null;
    const holdText = (raw.hold_s ?? "").trim();
    const holdS = holdText === "" ? null : Number(holdText);

    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ts)) {
      rowErrors.push(`${label}, line ${line}: ts must look like 2026-10-21T11:02:13 (got "${ts}").`);
    } else if (!EVENT_TYPES.includes(type)) {
      rowErrors.push(`${label}, line ${line}: type must be one of ${EVENT_TYPES.join(", ")} (got "${type}").`);
    } else if (holdS !== null && (!Number.isFinite(holdS) || holdS < 0)) {
      rowErrors.push(`${label}, line ${line}: hold_s must be a number of seconds (got "${holdText}").`);
    } else if (!productBySku.has(sku) || (otherSku && !productBySku.has(otherSku))) {
      unknownSkus.add(productBySku.has(sku) ? otherSku! : sku);
    } else {
      rows.push({ ts, type, sku, zone: (raw.zone ?? "").trim(), holdS, otherSku });
    }
  });

  const errors: string[] = [];
  if (unknownSkus.size > 0) {
    errors.push(
      `${label}: SKU ${[...unknownSkus].slice(0, 5).map((s) => `"${s}"`).join(", ")} is not in data/products.json.`,
    );
  }
  errors.push(...rowErrors.slice(0, MAX_ROW_ERRORS));
  if (rowErrors.length > MAX_ROW_ERRORS) {
    errors.push(`${label}: …and ${rowErrors.length - MAX_ROW_ERRORS} more rows with problems.`);
  }
  if (errors.length === 0 && rows.length === 0) errors.push(`${label}: has a header but no events yet.`);
  return { rows, errors };
}

export type ProductRow = {
  sku: string;
  name: string;
  colour: string;
  hex: string;
  rack: string;
  rackName: string;
  pickups: number;
  pickupShare: number; // 0 to 1
  avgHoldS: number | null;
  putBacks: number;
  putBackRate: number | null; // put-backs per pickup
  taken: number;
  compared: number;
  unitsSold: number | null; // null when no POS file was given
  salesShare: number | null;
  soldPer100Pickups: number | null;
  flagged: boolean; // high interest, low conversion
};

export type PickupReport = {
  days: string[];
  funnel: {
    onShelf: number;
    pickedUp: number;
    avgHoldS: number | null;
    compared: number;
    putBack: number;
    taken: number;
    purchased: number | null;
  };
  products: ProductRow[]; // most picked up first
  neverTouched: { sku: string; name: string; colour: string; rackName: string }[];
  pairs: { a: string; b: string; count: number }[];
  hours: { hour: string; pickups: number }[];
  hasSales: boolean;
  notes: string[];
};

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function buildPickupReport(events: PickupEvent[], sales: SaleRow[] | null): PickupReport {
  const notes: string[] = [];

  // The racks the camera watches. In presentation mode ("any") every product counts as on show.
  const zones = new Set(events.map((e) => e.zone));
  const watched = zones.has("any") ? [...products] : products.filter((p) => zones.has(p.rack));

  const bySku = new Map(watched.map((p) => [p.sku, { pickups: 0, holds: [] as number[], putBacks: 0, taken: 0, compared: 0 }]));
  const pairCounts = new Map<string, number>();
  const hourCounts = new Map<string, number>();
  const days = new Set<string>();
  let compareEvents = 0;
  const allHolds: number[] = [];

  for (const e of events) {
    // A product picked up on a rack that isn't its own (moved by a shopper) still counts for the product.
    if (!bySku.has(e.sku)) {
      const p = productBySku.get(e.sku);
      if (p) {
        watched.push(p);
        bySku.set(p.sku, { pickups: 0, holds: [], putBacks: 0, taken: 0, compared: 0 });
      }
    }
    const s = bySku.get(e.sku)!;
    days.add(e.ts.slice(0, 10));
    if (e.type === "pickup") {
      s.pickups++;
      const hour = `${e.ts.slice(11, 13)}:00`;
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    } else if (e.type === "put_back" || e.type === "taken") {
      if (e.type === "put_back") s.putBacks++;
      else s.taken++;
      if (e.holdS !== null) {
        s.holds.push(e.holdS);
        allHolds.push(e.holdS);
      }
    } else if (e.type === "compare" && e.otherSku) {
      compareEvents++;
      s.compared++;
      const other = bySku.get(e.otherSku);
      if (other) other.compared++;
      const key = [e.sku, e.otherSku].sort().join("|");
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
  }

  // Units sold per watched product, from the POS file if one was given.
  let unitsBySku: Map<string, number> | null = null;
  if (sales) {
    unitsBySku = new Map();
    for (const row of sales) {
      const sku = row.sku.toUpperCase();
      if (bySku.has(sku)) unitsBySku.set(sku, (unitsBySku.get(sku) ?? 0) + row.quantity);
    }
    if (unitsBySku.size === 0) {
      notes.push("None of the POS file's SKUs are products the camera watches, so no sales could be matched.");
    }
  }

  const totalPickups = [...bySku.values()].reduce((a, s) => a + s.pickups, 0);
  const totalUnits = unitsBySku ? [...unitsBySku.values()].reduce((a, b) => a + Math.max(0, b), 0) : 0;

  const rows: ProductRow[] = watched.map((p) => {
    const s = bySku.get(p.sku)!;
    const pickupShare = totalPickups ? s.pickups / totalPickups : 0;
    const units = unitsBySku ? Math.max(0, unitsBySku.get(p.sku) ?? 0) : null;
    const salesShare = units !== null && totalUnits > 0 ? units / totalUnits : null;
    return {
      sku: p.sku,
      name: p.name,
      colour: p.colour,
      hex: p.hex,
      rack: p.rack,
      rackName: rackName(p.rack),
      pickups: s.pickups,
      pickupShare,
      avgHoldS: avg(s.holds),
      putBacks: s.putBacks,
      putBackRate: s.pickups ? s.putBacks / s.pickups : null,
      taken: s.taken,
      compared: s.compared,
      unitsSold: units,
      salesShare,
      soldPer100Pickups: units !== null && s.pickups ? Math.round((units / s.pickups) * 100) : null,
      flagged: salesShare !== null && pickupShare >= MIN_PICKUP_SHARE && salesShare < pickupShare * SALES_TO_PICKUPS_RATIO,
    };
  });
  rows.sort((a, b) => b.pickups - a.pickups);

  const hours = [...hourCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([hour, pickups]) => ({ hour, pickups }));
  const pairs = [...pairCounts.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split("|");
      return { a, b, count };
    })
    .sort((x, y) => y.count - x.count)
    .slice(0, 6);
  const neverTouched = rows
    .filter((r) => r.pickups === 0)
    .map((r) => ({ sku: r.sku, name: r.name, colour: r.colour, rackName: r.rackName }));

  if (days.size > 1) notes.push(`The events cover ${days.size} days; a POS file should cover the same days.`);

  return {
    days: [...days].sort(),
    funnel: {
      onShelf: watched.length,
      pickedUp: totalPickups,
      avgHoldS: avg(allHolds),
      compared: compareEvents,
      putBack: rows.reduce((a, r) => a + r.putBacks, 0),
      taken: rows.reduce((a, r) => a + r.taken, 0),
      purchased: unitsBySku ? totalUnits : null,
    },
    products: rows,
    neverTouched,
    pairs,
    hours,
    hasSales: !!unitsBySku,
    notes,
  };
}
