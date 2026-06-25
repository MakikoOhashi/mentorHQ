import { NextResponse } from "next/server";

import { getLearnerCaseByQuestionId } from "@/lib/deliberation/mock";
import {
  advanceDailySession,
  getDailyReviewForSession,
  getObservationEventsForDailySession,
  getTomorrowPlanForSession
} from "@/lib/deliberation/session-memory";
import type { LearnerChoice, ObservationEventInput } from "@/lib/deliberation/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    observation?: ObservationEventInput;
    learner_choice?: LearnerChoice;
  };

  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const session = await advanceDailySession({ sessionId: body.sessionId, observation: body.observation });

  if (!session) {
    return NextResponse.json({ error: "Failed to advance daily session" }, { status: 500 });
  }

  const currentQuestionId =
    session.status === "completed" ? null : session.question_ids[session.current_index] ?? null;
  const learnerCase = currentQuestionId ? getLearnerCaseByQuestionId(currentQuestionId) : null;
  const observations = await getObservationEventsForDailySession(session.id);
  const dailyReview = await getDailyReviewForSession(session.id);
  const tomorrowPlan = await getTomorrowPlanForSession(session.id);

  return NextResponse.json({
    session,
    learnerCase,
    currentQuestionId,
    totalQuestions: session.question_ids.length,
    observations,
    latestObservation: observations.at(-1) ?? null,
    dailyReview,
    tomorrowPlan
  });
}
