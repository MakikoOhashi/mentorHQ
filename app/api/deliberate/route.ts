import { NextResponse } from "next/server";

import { generateDeliberation } from "@/lib/deliberation/gemini";
import type { LearnerCase } from "@/lib/deliberation/types";

export async function POST(request: Request) {
  const body = (await request.json()) as { learnerCase?: LearnerCase };

  if (!body.learnerCase) {
    return NextResponse.json({ error: "learnerCase is required" }, { status: 400 });
  }

  const result = await generateDeliberation(body.learnerCase);
  return NextResponse.json(result);
}
