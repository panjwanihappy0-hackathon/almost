// Joins stops with sales through the rack map, then flags and ranks racks.
// Plain arithmetic: the same files always give the same table.

import { MIN_STOP_SHARE, SALES_TO_STOPS_RATIO } from "./limits";
import type { SaleRow, StopRow } from "./parse";

export type Rack = { id: string; name: string; skus: string[] };
export type RackMap = { store: string; racks: Rack[] };

export type RackResult = {
  rackId: string;
  name: string;
  stops: number;
  stopShare: number; // 0 to 1
  unitsSold: number;
  salesShare: number; // 0 to 1
  busiestHour: string | null;
  flagged: boolean;
};

export type JoinResult = {
  racks: RackResult[];
  totalStops: number;
  totalUnits: number;
  notes: string[]; // things worth knowing that aren't errors
  errors: string[];
};

export function joinStopsAndSales(map: RackMap, stops: StopRow[], sales: SaleRow[]): JoinResult {
  const notes: string[] = [];

  // Which rack each SKU sits on.
  const rackOfSku = new Map<string, string>();
  for (const rack of map.racks) {
    for (const sku of rack.skus) rackOfSku.set(sku.toUpperCase(), rack.id);
  }

  // Add up stops per rack, and per rack per hour to find the busiest hour.
  const stopsByRack = new Map<string, number>();
  const stopsByRackHour = new Map<string, Map<string, number>>();
  for (const row of stops) {
    stopsByRack.set(row.rackId, (stopsByRack.get(row.rackId) ?? 0) + row.stops);
    const hours = stopsByRackHour.get(row.rackId) ?? new Map<string, number>();
    hours.set(row.hour, (hours.get(row.hour) ?? 0) + row.stops);
    stopsByRackHour.set(row.rackId, hours);
  }

  // Add up units sold per rack. Items that aren't on any rack (e.g. at the till) are left out.
  const unitsByRack = new Map<string, number>();
  const unmappedSkus = new Set<string>();
  let unmappedUnits = 0;
  for (const row of sales) {
    const rackId = rackOfSku.get(row.sku.toUpperCase());
    if (rackId) {
      unitsByRack.set(rackId, (unitsByRack.get(rackId) ?? 0) + row.quantity);
    } else {
      unmappedSkus.add(row.sku);
      unmappedUnits += row.quantity;
    }
  }

  const totalStops = [...stopsByRack.values()].reduce((a, b) => a + b, 0);
  const totalUnits = [...unitsByRack.values()].reduce((a, b) => a + b, 0);

  const errors: string[] = [];
  if (totalStops === 0) {
    errors.push("Stops file: every rack has 0 stops, so there is nothing to compare.");
  }
  if (totalUnits <= 0) {
    errors.push(
      "POS sales file: none of its SKUs are in the rack map, so no sales could be matched to a rack. " +
        `Example SKUs in the file: ${[...unmappedSkus].slice(0, 3).join(", ") || "none"}.`,
    );
  }
  if (errors.length > 0) return { racks: [], totalStops, totalUnits, notes, errors };

  if (unmappedSkus.size > 0) {
    notes.push(
      `${unmappedUnits} units from ${unmappedSkus.size} SKUs aren't on any rack in the map, so they were left out ` +
        `(e.g. ${[...unmappedSkus].slice(0, 3).join(", ")}).`,
    );
  }

  const racks: RackResult[] = map.racks.map((rack) => {
    const rackStops = stopsByRack.get(rack.id) ?? 0;
    const units = Math.max(0, unitsByRack.get(rack.id) ?? 0); // returns can't make a share negative
    const stopShare = rackStops / totalStops;
    const salesShare = units / totalUnits;

    let busiestHour: string | null = null;
    let busiestCount = 0;
    for (const [hour, count] of stopsByRackHour.get(rack.id) ?? []) {
      if (count > busiestCount) {
        busiestHour = hour;
        busiestCount = count;
      }
    }

    return {
      rackId: rack.id,
      name: rack.name,
      stops: rackStops,
      stopShare,
      unitsSold: units,
      salesShare,
      busiestHour,
      flagged: stopShare >= MIN_STOP_SHARE && salesShare < stopShare * SALES_TO_STOPS_RATIO,
    };
  });

  // Biggest gap between attention and sales first.
  racks.sort((a, b) => b.stopShare - b.salesShare - (a.stopShare - a.salesShare));

  return { racks, totalStops, totalUnits, notes, errors };
}
