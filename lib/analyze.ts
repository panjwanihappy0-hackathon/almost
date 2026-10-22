// Checks an upload and builds the rack table. Shared by /api/analyze and /api/brief,
// so the brief is always written from numbers the server worked out itself.

import rackMapJson from "@/data/rack-map.json";
import { joinStopsAndSales, type JoinResult, type RackMap } from "./join";
import { parseSales, parseStops, readCsvFile, readFrames, type Frame } from "./parse";

export const rackMap = rackMapJson as RackMap;

export type Analysis =
  | { ok: true; result: JoinResult; frames: Frame[] }
  | { ok: false; errors: string[] };

export async function analyzeUpload(form: FormData): Promise<Analysis> {
  const knownRackIds = new Set(rackMap.racks.map((r) => r.id));

  // 1. Check every file first, and collect all problems so the user can fix them in one go.
  const errors: string[] = [];
  const stopsFile = await readCsvFile(form.get("stops"), "Stops file");
  const salesFile = await readCsvFile(form.get("sales"), "POS sales file");
  if ("error" in stopsFile) errors.push(stopsFile.error);
  if ("error" in salesFile) errors.push(salesFile.error);

  const stops = "text" in stopsFile ? parseStops(stopsFile.text, knownRackIds) : null;
  const sales = "text" in salesFile ? parseSales(salesFile.text) : null;
  const frames = await readFrames(form.getAll("frames"), knownRackIds);
  errors.push(...(stops?.errors ?? []), ...(sales?.errors ?? []), ...frames.errors);

  if (errors.length > 0 || !stops || !sales) return { ok: false, errors };

  // 2. Join stops with sales and rank the racks.
  const result = joinStopsAndSales(rackMap, stops.rows, sales.rows);
  if (result.errors.length > 0) return { ok: false, errors: result.errors };

  return { ok: true, result, frames: frames.rows };
}
