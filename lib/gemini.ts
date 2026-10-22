// The only place the app uses AI: Gemini writes the brief for the flagged racks.
// It runs on the server only. The key comes from GEMINI_API_KEY and never reaches the browser.

import { GoogleGenAI, type Part } from "@google/genai";
import type { RackResult } from "./join";
import type { Frame } from "./parse";

export type RackBrief = {
  rack_id: string;
  headline: string;
  reasons: string[];
  other_causes: string[];
  fix: string;
};

// The exact shape Gemini must answer in, so the page never has to guess.
const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    racks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rack_id: { type: "string" },
          headline: { type: "string", description: "One line that states the gap with both numbers." },
          reasons: { type: "array", items: { type: "string" }, description: "Exactly 2 likely reasons." },
          other_causes: { type: "array", items: { type: "string" }, description: "Stock, price and promo checks." },
          fix: { type: "string", description: "One concrete fix the store can make this week." },
        },
        required: ["rack_id", "headline", "reasons", "other_causes", "fix"],
      },
    },
  },
  required: ["racks"],
};

const INSTRUCTIONS = `You advise the head of retail at an Indian fashion brand.
CCTV counted how many shoppers stopped at each rack; the POS counted units sold from each rack.
The racks below get a large share of stops but a small share of sales.
For each rack:
- headline: one line stating the gap, using the exact percentages given.
- reasons: exactly 2 likely reasons the rack attracts stops but not sales. If a snapshot frame is attached, use what you can see in it (display, signage, crowding, sizes, mirrors) and say so.
- other_causes: list stock-outs (especially sizes), price, and promotions as other causes to check before changing the display, each as a short check.
- fix: one concrete change the store team can make this week.
Use only the numbers given. Do not invent numbers, products or facts. Keep each item to one or two sentences.`;

const pct = (share: number) => `${Math.round(share * 100)}%`;

export async function writeBrief(store: string, flagged: RackResult[], frames: Frame[]): Promise<RackBrief[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const ai = new GoogleGenAI({ apiKey });

  // Numbers as a small table, then each rack's snapshot frame labelled with its rack.
  const table = flagged
    .map(
      (r) =>
        `- ${r.rackId} "${r.name}": ${r.stops} stops (${pct(r.stopShare)} of all stops), ` +
        `${r.unitsSold} units sold (${pct(r.salesShare)} of all sales)` +
        (r.busiestHour ? `, busiest hour ${r.busiestHour}` : ""),
    )
    .join("\n");

  const parts: Part[] = [{ text: `${INSTRUCTIONS}\n\nStore: ${store}\nFlagged racks:\n${table}` }];
  for (const rack of flagged) {
    const frame = frames.find((f) => f.rackId === rack.rackId);
    if (frame) {
      parts.push({ text: `Snapshot frame for ${rack.rackId} "${rack.name}":` });
      parts.push({ inlineData: { mimeType: frame.mimeType, data: frame.base64 } });
    }
  }

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    contents: [{ role: "user", parts }],
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseJsonSchema: BRIEF_SCHEMA,
      httpOptions: { timeout: 45_000 },
    },
  });

  // Keep only well-formed entries for racks we actually flagged, in table order.
  const parsed = JSON.parse(response.text ?? "{}") as { racks?: RackBrief[] };
  const byId = new Map((parsed.racks ?? []).map((b) => [b.rack_id, b]));
  const briefs = flagged
    .map((r) => byId.get(r.rackId))
    .filter(
      (b): b is RackBrief =>
        !!b && typeof b.headline === "string" && typeof b.fix === "string" &&
        Array.isArray(b.reasons) && Array.isArray(b.other_causes),
    );
  if (briefs.length === 0) {
    throw new Error("Gemini's answer had no usable rack briefs");
  }
  return briefs;
}
