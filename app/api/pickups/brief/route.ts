// POST /api/pickups/brief: re-checks the same upload, then asks Gemini about the products
// that are picked up a lot but rarely bought. Gemini is only called when every file passed.

import { analyzePickupUpload } from "@/lib/analyze-pickups";
import { BriefError, writeProductBrief } from "@/lib/gemini";
import { productBySku } from "@/lib/products";

// Give Gemini up to a minute on Vercel.
export const maxDuration = 60;

export async function POST(request: Request) {
  let analysis;
  try {
    analysis = await analyzePickupUpload(await request.formData());
  } catch (err) {
    console.error("pickups brief: reading the upload failed:", err);
    return Response.json({ error: "Couldn't read the files for the brief." }, { status: 500 });
  }
  if (!analysis.ok) {
    return Response.json({ error: analysis.errors.join(" ") }, { status: 400 });
  }

  const { report } = analysis;
  const flagged = report.products
    .filter((p) => p.flagged)
    .map((p) => ({
      ...p,
      price: productBySku.get(p.sku)?.price ?? 0,
      comparedWith: report.pairs
        .filter((pair) => pair.a === p.sku || pair.b === p.sku)
        .slice(0, 2)
        .map((pair) => productBySku.get(pair.a === p.sku ? pair.b : pair.a)?.name ?? ""),
    }));
  if (flagged.length === 0) {
    return Response.json({ products: [] });
  }

  try {
    console.log(`pickups brief: asking Gemini about ${flagged.length} flagged products`);
    return Response.json({ products: await writeProductBrief(flagged) });
  } catch (err) {
    console.error("pickups brief: Gemini failed:", err);
    const reason = err instanceof BriefError ? err.reason : "failed";
    const error = {
      missing_key: "Brief unavailable: the OpenRouter API key isn't set on the server.",
      bad_key: "Brief unavailable: OpenRouter rejected the API key. Check OPENROUTER_API_KEY.",
      no_credit: "Brief unavailable: the OpenRouter account is out of credit.",
      failed: "Brief unavailable: Gemini didn't answer. Try again.",
    }[reason];
    return Response.json({ error }, { status: 502 });
  }
}
