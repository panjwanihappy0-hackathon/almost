// POST /api/brief: re-checks the same upload, then asks Gemini to write the brief.
// Gemini is only called when every file passed the checks.

import { analyzeUpload, rackMap } from "@/lib/analyze";
import { BriefError, writeBrief } from "@/lib/gemini";

// Give Gemini up to a minute on Vercel.
export const maxDuration = 60;

export async function POST(request: Request) {
  let analysis;
  try {
    analysis = await analyzeUpload(await request.formData());
  } catch (err) {
    console.error("brief: reading the upload failed:", err);
    return Response.json({ error: "Couldn't read the files for the brief." }, { status: 500 });
  }
  if (!analysis.ok) {
    return Response.json({ error: analysis.errors.join(" ") }, { status: 400 });
  }

  const flagged = analysis.result.racks.filter((r) => r.flagged);
  if (flagged.length === 0) {
    return Response.json({ racks: [] });
  }

  try {
    console.log(`brief: asking Gemini about ${flagged.length} flagged racks`);
    const racks = await writeBrief(rackMap.store, flagged, analysis.frames);
    return Response.json({ racks });
  } catch (err) {
    console.error("brief: Gemini failed:", err);
    const reason = err instanceof BriefError ? err.reason : "failed";
    const error = {
      missing_key: "Brief unavailable: the OpenRouter API key isn't set on the server.",
      bad_key: "Brief unavailable: OpenRouter rejected the API key. Check OPENROUTER_API_KEY.",
      no_credit: "Brief unavailable: the OpenRouter account is out of credit.",
      failed: "Brief unavailable: Gemini didn't answer. Try again.",
    }[reason];
    return Response.json(
      { error },
      { status: 502 },
    );
  }
}
