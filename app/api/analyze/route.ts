// POST /api/analyze: checks the uploaded files, then builds the ranked rack table.
// No AI here, so it answers in about a second and costs nothing.

import { analyzeUpload, rackMap } from "@/lib/analyze";

export async function POST(request: Request) {
  try {
    const analysis = await analyzeUpload(await request.formData());
    if (!analysis.ok) {
      return Response.json({ errors: analysis.errors }, { status: 400 });
    }

    const { result, frames } = analysis;
    return Response.json({
      store: rackMap.store,
      racks: result.racks,
      totalStops: result.totalStops,
      totalUnits: result.totalUnits,
      notes: result.notes,
      frameRackIds: frames.map((f) => f.rackId),
    });
  } catch (err) {
    console.error("analyze failed:", err);
    return Response.json(
      { errors: ["Something went wrong reading the files. Please check them and try again."] },
      { status: 500 },
    );
  }
}
