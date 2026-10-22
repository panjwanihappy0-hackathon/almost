// POST /api/pickups: checks the events file (and the POS file, if given), then builds the
// product report. No AI here, so it answers in about a second and costs nothing.

import { analyzePickupUpload } from "@/lib/analyze-pickups";

export async function POST(request: Request) {
  try {
    const analysis = await analyzePickupUpload(await request.formData());
    if (!analysis.ok) {
      return Response.json({ errors: analysis.errors }, { status: 400 });
    }
    return Response.json(analysis.report);
  } catch (err) {
    console.error("pickups failed:", err);
    return Response.json(
      { errors: ["Something went wrong reading the files. Please check them and try again."] },
      { status: 500 },
    );
  }
}
