import { NextResponse } from "next/server";

import { generateCoachMindTurns } from "@/lib/deliberation/coach-mind";
import type { CoachMindTurnOutput, ObservationEvent } from "@/lib/deliberation/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    latestObservation?: ObservationEvent;
    recentObservations?: ObservationEvent[];
    existingThoughts?: CoachMindTurnOutput[];
  };

  if (!body.latestObservation || !Array.isArray(body.recentObservations)) {
    return NextResponse.json({ error: "latestObservation and recentObservations are required" }, { status: 400 });
  }

  const result = await generateCoachMindTurns({
    latestObservation: body.latestObservation,
    recentObservations: body.recentObservations,
    existingThoughts: body.existingThoughts
  });

  return NextResponse.json(result);
}
