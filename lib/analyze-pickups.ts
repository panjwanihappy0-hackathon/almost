// Checks a pickups upload (events file, optional POS file) and builds the report.
// Shared by /api/pickups and /api/pickups/brief, so the brief is written from numbers
// the server worked out itself.

import { parseSales, readCsvFile } from "./parse";
import { buildPickupReport, parseEvents, type PickupReport } from "./pickups";

export type PickupAnalysis = { ok: true; report: PickupReport } | { ok: false; errors: string[] };

export async function analyzePickupUpload(form: FormData): Promise<PickupAnalysis> {
  const errors: string[] = [];
  const eventsFile = await readCsvFile(form.get("events"), "Events file");
  if ("error" in eventsFile) errors.push(eventsFile.error);

  // The POS file is optional: without it the report stops at "put back".
  const salesEntry = form.get("sales");
  const hasSales = salesEntry instanceof File && (salesEntry.size > 0 || salesEntry.name !== "");
  const salesFile = hasSales ? await readCsvFile(salesEntry, "POS sales file") : null;
  if (salesFile && "error" in salesFile) errors.push(salesFile.error);

  const events = "text" in eventsFile ? parseEvents(eventsFile.text) : null;
  const sales = salesFile && "text" in salesFile ? parseSales(salesFile.text) : null;
  errors.push(...(events?.errors ?? []), ...(sales?.errors ?? []));
  if (errors.length > 0 || !events) return { ok: false, errors };

  return { ok: true, report: buildPickupReport(events.rows, sales ? sales.rows : null) };
}
