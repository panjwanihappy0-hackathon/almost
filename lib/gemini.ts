// The only place the app uses AI: Gemini writes the brief for the flagged racks.
// Gemini is reached through OpenRouter. This runs on the server only: the key comes from
// OPENROUTER_API_KEY and never reaches the browser.

import type { RackResult } from "./join";
import type { Frame } from "./parse";

// Says why the brief failed, so the page can show the right message.
export class BriefError extends Error {
  constructor(
    public reason: "missing_key" | "bad_key" | "no_credit" | "failed",
    message: string,
  ) {
    super(message);
  }
}

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
        additionalProperties: false,
      },
    },
  },
  required: ["racks"],
  additionalProperties: false,
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
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new BriefError("missing_key", "OPENROUTER_API_KEY is not set");
  }

  // Numbers as a small table, then each rack's snapshot frame labelled with its rack.
  const table = flagged
    .map(
      (r) =>
        `- ${r.rackId} "${r.name}": ${r.stops} stops (${pct(r.stopShare)} of all stops), ` +
        `${r.unitsSold} units sold (${pct(r.salesShare)} of all sales)` +
        (r.busiestHour ? `, busiest hour ${r.busiestHour}` : ""),
    )
    .join("\n");

  type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
  const parts: ContentPart[] = [{ type: "text", text: `${INSTRUCTIONS}\n\nStore: ${store}\nFlagged racks:\n${table}` }];
  for (const rack of flagged) {
    const frame = frames.find((f) => f.rackId === rack.rackId);
    if (frame) {
      parts.push({ type: "text", text: `Snapshot frame for ${rack.rackId} "${rack.name}":` });
      parts.push({ type: "image_url", image_url: { url: `data:${frame.mimeType};base64,${frame.base64}` } });
    }
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Almost" },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "google/gemini-3.8-flash",
      messages: [{ role: "user", content: parts }],
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: { name: "rack_brief", strict: true, schema: BRIEF_SCHEMA },
      },
    }),
    signal: AbortSignal.timeout(55_000), // just under the route's 60 s limit on Vercel
  });
  if (res.status === 401) throw new BriefError("bad_key", "OpenRouter rejected the API key");
  if (res.status === 402) throw new BriefError("no_credit", "OpenRouter account is out of credit");
  if (!res.ok) throw new BriefError("failed", `OpenRouter answered ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "{}";

  // Keep only well-formed entries for racks we actually flagged, in table order.
  const parsed = JSON.parse(text) as { racks?: RackBrief[] };
  const byId = new Map((parsed.racks ?? []).map((b) => [b.rack_id, b]));
  const briefs = flagged
    .map((r) => byId.get(r.rackId))
    .filter(
      (b): b is RackBrief =>
        !!b && typeof b.headline === "string" && typeof b.fix === "string" &&
        Array.isArray(b.reasons) && Array.isArray(b.other_causes),
    );
  if (briefs.length === 0) {
    throw new BriefError("failed", "Gemini's answer had no usable rack briefs");
  }
  return briefs;
}
