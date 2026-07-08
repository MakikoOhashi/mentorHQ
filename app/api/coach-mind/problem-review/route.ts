import { NextResponse } from "next/server";

import { generateProblemReviewTurns } from "@/lib/deliberation/coach-mind";
import type { CoachMindTurnOutput, ObservationEvent } from "@/lib/deliberation/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    latestObservation?: ObservationEvent;
    observations?: ObservationEvent[];
    finalResult?: {
      selectedIndex?: number;
      correctIndex?: number;
      final_answer?: number;
      correct_answer?: number;
      final_answer_correct?: boolean;
      summary?: string;
    };
    existingThoughts?: CoachMindTurnOutput[];
  };

  if (!body.latestObservation || !Array.isArray(body.observations) || !body.finalResult) {
    return NextResponse.json(
      { error: "latestObservation, observations and finalResult are required" },
      { status: 400 }
    );
  }

  if (
    typeof body.finalResult.selectedIndex !== "number" ||
    typeof body.finalResult.correctIndex !== "number" ||
    typeof body.finalResult.final_answer !== "number" ||
    typeof body.finalResult.correct_answer !== "number" ||
    typeof body.finalResult.final_answer_correct !== "boolean" ||
    typeof body.finalResult.summary !== "string"
  ) {
    return NextResponse.json(
      {
        error:
          "finalResult must include selectedIndex, correctIndex, final_answer, correct_answer, final_answer_correct and summary"
      },
      { status: 400 }
    );
  }

  const finalResult = body.finalResult as {
    selectedIndex: number;
    correctIndex: number;
    final_answer: number;
    correct_answer: number;
    final_answer_correct: boolean;
    summary: string;
  };

  console.info("[coach-mind][api][problem-review] request", {
    latestObservationId: body.latestObservation.id,
    observationCount: body.observations.length,
    existingThoughtCount: body.existingThoughts?.length ?? 0,
    selectedIndex: body.finalResult.selectedIndex,
    correctIndex: body.finalResult.correctIndex,
    final_answer: body.finalResult.final_answer,
    correct_answer: body.finalResult.correct_answer,
    final_answer_correct: body.finalResult.final_answer_correct
  });

  const result = await generateProblemReviewTurns({
    latestObservation: body.latestObservation,
    observations: body.observations,
    finalResult,
    existingThoughts: body.existingThoughts
  });

  console.info("[coach-mind][api][problem-review] response", {
    latestObservationId: body.latestObservation.id,
    mode: result.mode,
    turnCount: result.turns.length
  });

  return NextResponse.json(result);
}
