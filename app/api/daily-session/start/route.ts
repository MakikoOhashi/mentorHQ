import { NextResponse } from "next/server";

import { getLearnerCaseByQuestionId, getMockDailyPracticeQuestionIds } from "@/lib/deliberation/mock";
import { createDailySession, getObservationEventsForDailySession } from "@/lib/deliberation/session-memory";

export const runtime = "nodejs";

export async function POST() {
  const questionIds = getMockDailyPracticeQuestionIds();
  const session = await createDailySession({
    questionIds,
    status: "active",
    currentIndex: 0,
    observationCount: 0,
    reviewStatus: "pending"
  });

  if (!session) {
    return NextResponse.json({ error: "Failed to start daily session" }, { status: 500 });
  }

  const currentQuestionId = session.question_ids[session.current_index] ?? null;
  const learnerCase = currentQuestionId ? getLearnerCaseByQuestionId(currentQuestionId) : null;
  const observations = await getObservationEventsForDailySession(session.id);

  return NextResponse.json({
    session,
    learnerCase,
    currentQuestionId,
    totalQuestions: session.question_ids.length,
    observations,
    latestObservation: observations.at(-1) ?? null
  });
}
