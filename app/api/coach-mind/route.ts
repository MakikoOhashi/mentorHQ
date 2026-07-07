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

  console.info("[coach-mind][api] request", {
    latestObservationId: body.latestObservation.id,
    recentObservationCount: body.recentObservations.length,
    existingThoughtCount: body.existingThoughts?.length ?? 0,
    optimisticStatus:
      "optimistic_status" in body.latestObservation
        ? (body.latestObservation as ObservationEvent & { optimistic_status?: string }).optimistic_status
        : undefined
  });

  const result = await generateCoachMindTurns({
    latestObservation: body.latestObservation,
    recentObservations: body.recentObservations,
    existingThoughts: body.existingThoughts
  });

  console.info("[coach-mind][api] response", {
    latestObservationId: body.latestObservation.id,
    mode: result.mode,
    turnCount: result.turns.length
  });

  return NextResponse.json(result);
}
