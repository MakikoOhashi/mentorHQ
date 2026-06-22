import { NextResponse } from "next/server";

import { generateDeliberation } from "@/lib/deliberation/gemini";
import { saveDeliberationSession } from "@/lib/deliberation/session-memory";
import type { LearnerCase } from "@/lib/deliberation/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { learnerCase?: LearnerCase };

  if (!body.learnerCase) {
    return NextResponse.json({ error: "learnerCase is required" }, { status: 400 });
  }

  const result = await generateDeliberation(body.learnerCase);
  await saveDeliberationSession({
    learnerCase: body.learnerCase,
    deliberation: result
  });

  return NextResponse.json(result);
}
