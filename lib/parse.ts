// Reads and checks the uploaded files. This is plain code: no AI.
// Every message the user sees about a bad file is written here.

import Papa from "papaparse";
import { MAX_CSV_BYTES, MAX_FRAME_BYTES, MAX_FRAMES, formatMB } from "./limits";

// The POS export's column names. Change these to match your real export
// (they're compared in lowercase, with spaces trimmed).
export const POS_COLUMNS = { sku: "sku", quantity: "quantity" };
export const STOPS_COLUMNS = { rackId: "rack_id", hour: "hour", stops: "stops" };

// Show at most this many row problems per file, so one bad file doesn't flood the screen.
const MAX_ROW_ERRORS = 5;

export type StopRow = { rackId: string; hour: string; stops: number };
export type SaleRow = { sku: string; quantity: number };
export type Frame = { rackId: string; mimeType: string; base64: string };

type Parsed<T> = { rows: T[]; errors: string[] };

// Checks that a CSV file is there, is a .csv, isn't too big and isn't empty.
// Returns the file's text, or an error message.
export async function readCsvFile(
  file: FormDataEntryValue | null,
  label: string,
): Promise<{ text: string } | { error: string }> {
  // Browsers send an empty, nameless file when the picker was left blank.
  if (!file || typeof file === "string" || (file.size === 0 && file.name === "")) {
    return { error: `${label}: no file chosen.` };
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return { error: `${label}: "${file.name}" is not a .csv file.` };
  }
  if (file.size > MAX_CSV_BYTES) {
    return { error: `${label}: "${file.name}" is ${formatMB(file.size)}; the limit is ${formatMB(MAX_CSV_BYTES)}.` };
  }
  const text = (await file.text()).trim();
  if (text === "") {
    return { error: `${label}: "${file.name}" is empty.` };
  }
  return { text };
}

function parseCsv(text: string) {
  return Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
}

// Returns an error if any required column is missing, naming the columns that were found.
function missingColumns(label: string, found: string[], required: string[]): string | null {
  const missing = required.filter((c) => !found.includes(c));
  if (missing.length === 0) return null;
  const list = missing.map((c) => `"${c}"`).join(", ");
  const foundList = found.length > 0 ? found.join(", ") : "none";
  const noun = missing.length === 1 ? "column" : "columns";
  return `${label}: missing the ${noun} ${list}. Columns found: ${foundList}.`;
}

function capRowErrors(label: string, rowErrors: string[]): string[] {
  if (rowErrors.length <= MAX_ROW_ERRORS) return rowErrors;
  return [
    ...rowErrors.slice(0, MAX_ROW_ERRORS),
    `${label}: …and ${rowErrors.length - MAX_ROW_ERRORS} more rows with problems.`,
  ];
}

// Stops file: one row per rack per hour, made by detector/count_stops.py.
export function parseStops(text: string, knownRackIds: Set<string>): Parsed<StopRow> {
  const label = "Stops file";
  const result = parseCsv(text);
  const fields = result.meta.fields ?? [];
  const missing = missingColumns(label, fields, Object.values(STOPS_COLUMNS));
  if (missing) return { rows: [], errors: [missing] };

  const rows: StopRow[] = [];
  const rowErrors: string[] = [];
  const unknownRacks = new Set<string>();

  result.data.forEach((raw, i) => {
    const line = i + 2; // +1 for the header, +1 because people count lines from 1
    const rackId = (raw[STOPS_COLUMNS.rackId] ?? "").trim();
    const hour = (raw[STOPS_COLUMNS.hour] ?? "").trim();
    const stops = Number((raw[STOPS_COLUMNS.stops] ?? "").trim());

    if (rackId === "") {
      rowErrors.push(`${label}, line ${line}: rack_id is blank.`);
    } else if (!knownRackIds.has(rackId)) {
      unknownRacks.add(rackId);
    } else if (!Number.isInteger(stops) || stops < 0) {
      rowErrors.push(`${label}, line ${line}: stops must be a whole number of 0 or more (got "${raw[STOPS_COLUMNS.stops] ?? ""}").`);
    } else {
      rows.push({ rackId, hour, stops });
    }
  });

  const errors: string[] = [];
  if (unknownRacks.size > 0) {
    errors.push(
      `${label}: rack ${[...unknownRacks].map((r) => `"${r}"`).join(", ")} is not in the rack map. ` +
        `Known racks: ${[...knownRackIds].join(", ")}.`,
    );
  }
  errors.push(...capRowErrors(label, rowErrors));
  if (errors.length === 0 && rows.length === 0) {
    errors.push(`${label}: has a header but no data rows.`);
  }
  return { rows, errors };
}

// POS sales file: one row per item sold. Only the SKU and quantity are used.
export function parseSales(text: string): Parsed<SaleRow> {
  const label = "POS sales file";
  const result = parseCsv(text);
  const fields = result.meta.fields ?? [];
  const missing = missingColumns(label, fields, Object.values(POS_COLUMNS));
  if (missing) return { rows: [], errors: [missing] };

  const rows: SaleRow[] = [];
  const rowErrors: string[] = [];

  result.data.forEach((raw, i) => {
    const line = i + 2;
    const sku = (raw[POS_COLUMNS.sku] ?? "").trim();
    const quantity = Number((raw[POS_COLUMNS.quantity] ?? "").trim());

    if (sku === "") {
      rowErrors.push(`${label}, line ${line}: sku is blank.`);
    } else if (!Number.isFinite(quantity)) {
      rowErrors.push(`${label}, line ${line}: quantity must be a number (got "${raw[POS_COLUMNS.quantity] ?? ""}").`);
    } else {
      rows.push({ sku, quantity });
    }
  });

  const errors = capRowErrors(label, rowErrors);
  if (errors.length === 0 && rows.length === 0) {
    errors.push(`${label}: has a header but no data rows.`);
  }
  return { rows, errors };
}

// The first bytes of each image type we accept, so a renamed non-image is caught.
function detectImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const ascii = String.fromCharCode(...bytes.slice(0, 12));
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

// Snapshot frames are optional. Each must be named after its rack, like "rack_R4.jpg".
export async function readFrames(
  entries: FormDataEntryValue[],
  knownRackIds: Set<string>,
): Promise<Parsed<Frame>> {
  const label = "Snapshot frames";
  const files = entries.filter((e): e is File => typeof e !== "string" && e.size > 0);
  if (files.length > MAX_FRAMES) {
    return { rows: [], errors: [`${label}: ${files.length} chosen; the limit is ${MAX_FRAMES}.`] };
  }

  const rows: Frame[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const match = file.name.match(/^rack_(.+)\.(jpe?g|png|webp)$/i);
    if (!match) {
      errors.push(`${label}: "${file.name}" should be named like "rack_R4.jpg" (rack ID after "rack_").`);
      continue;
    }
    const rackId = match[1];
    if (!knownRackIds.has(rackId)) {
      errors.push(`${label}: "${file.name}" is for rack "${rackId}", which is not in the rack map.`);
      continue;
    }
    if (file.size > MAX_FRAME_BYTES) {
      errors.push(`${label}: "${file.name}" is ${formatMB(file.size)}; the limit is ${formatMB(MAX_FRAME_BYTES)} per frame.`);
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = detectImageType(bytes);
    if (!mimeType) {
      errors.push(`${label}: "${file.name}" is not a real JPEG, PNG or WebP image.`);
      continue;
    }
    rows.push({ rackId, mimeType, base64: Buffer.from(bytes).toString("base64") });
  }
  return { rows, errors };
}
